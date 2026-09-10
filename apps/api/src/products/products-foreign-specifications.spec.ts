import { ProductsService } from './products.service';

/**
 * Foreign product characteristics (2026-09-11, P3 PR 1).
 *
 * A production audit found 18 `product_specifications` rows on 11 live,
 * non-demo products whose attribute belongs to a DIFFERENT category from the
 * product — « Type : Bière » on a Johnnie Walker whisky among them, rendered
 * to buyers. The chain that produced them:
 *
 *   1. the 2026-06-24 refactor REUSED category ids with new meanings, leaving
 *      legacy attributes attached to ids that now mean something else;
 *   2. products were remapped onto the new tree, their specifications were not;
 *   3. `dedupeSpecificationsByName` renders foreign rows on purpose (7 of the
 *      11 products would otherwise show nothing);
 *   4. `update()` replaces only attributes the seller's form can serve, so a
 *      foreign row appears in no form and the seller can NEVER remove it.
 *
 * These tests pin step 4's fix. They are deliberately written against generic
 * categories rather than whisky/laptop so they cannot be satisfied by
 * special-casing the two products that exposed the bug.
 */
const OWN_CAT = 'cat-own';
const OTHER_CAT = 'cat-other';
const NEW_CAT = 'cat-new';

interface SpecRow {
  id: string;
  attributeId: string;
  attribute: { name: string; categoryId: string } | null;
}

function makeService(opts: {
  productCategoryId?: string;
  specs?: SpecRow[];
  ownAttributes?: { id: string; name: string }[];
  childCount?: number;
} = {}) {
  const productCategoryId = opts.productCategoryId ?? OWN_CAT;
  const specs = opts.specs ?? [];
  const ownAttributes = opts.ownAttributes ?? [];

  const tx = {
    productSpecification: {
      findMany: jest.fn().mockResolvedValue(specs),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    category: { count: jest.fn().mockResolvedValue(opts.childCount ?? 0) },
    productAttribute: { findMany: jest.fn().mockResolvedValue(ownAttributes) },
    product: {
      update: jest.fn().mockResolvedValue({
        id: 'p1',
        categoryId: productCategoryId,
        specifications: [],
        images: [],
        category: { id: productCategoryId, name: 'Cat' },
      }),
    },
  };

  const prisma = {
    productSpecification: {
      findMany: jest.fn().mockResolvedValue(specs),
    },
    product: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'p1',
        sellerId: 'seller1',
        categoryId: productCategoryId,
        status: 'DRAFT',
        title: 'T',
        description: 'D',
        brandId: null,
        condition: 'NEW',
        priceCDF: 1000n,
        priceUSD: null,
        discountPriceCDF: null,
        discountPriceUSD: null,
        deletedAt: null,
      }),
    },
    category: {
      findUnique: jest.fn().mockResolvedValue({ id: NEW_CAT, name: 'Nouvelle', isActive: true, deletedAt: null }),
      count: jest.fn().mockResolvedValue(opts.childCount ?? 0),
    },
    productAttribute: { findMany: jest.fn().mockResolvedValue(ownAttributes) },
    $transaction: jest.fn().mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)),
  };

  const service = new ProductsService(
    prisma as never,
    {} as never,
    { capture: jest.fn() } as never,
    { create: jest.fn() } as never,
  );
  return { service, prisma, tx };
}

const spec = (id: string, attributeId: string, name: string, categoryId: string): SpecRow => ({
  id, attributeId, attribute: { name, categoryId },
});

describe('ProductsService.update — foreign characteristics are reconciled', () => {
  it('repoints a foreign characteristic onto the same-named attribute of the product\'s own category, keeping the value', async () => {
    // The whisky case in general form: « Volume » stored against another
    // category's attribute while the product's own leaf has its own « Volume ».
    const { service, tx } = makeService({
      specs: [spec('s1', 'attr-foreign', 'Volume', OTHER_CAT)],
      ownAttributes: [{ id: 'attr-own', name: 'Volume' }],
    });
    await service.update('seller1', 'p1', { quantity: 3 } as never);
    expect(tx.productSpecification.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { attributeId: 'attr-own' },
    });
    // the row is NOT deleted — the seller's value survives
    expect(tx.productSpecification.deleteMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: expect.anything() } }));
  });

  it('matches names accent- and case-insensitively', async () => {
    const { service, tx } = makeService({
      specs: [spec('s1', 'attr-foreign', '  MATIERE ', OTHER_CAT)],
      ownAttributes: [{ id: 'attr-own', name: 'Matière' }],
    });
    await service.update('seller1', 'p1', { quantity: 3 } as never);
    expect(tx.productSpecification.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { attributeId: 'attr-own' },
    });
  });

  it('does NOT delete a foreign characteristic with no home when the category did not change', async () => {
    // « Huile végétale », « Savon de lessive » etc: real seller data with no
    // canonical attribute yet. Destroying it on an unrelated stock edit is the
    // exact data loss the scoped replace was introduced to prevent.
    const { service, tx } = makeService({
      specs: [spec('s1', 'attr-foreign', 'Type', OTHER_CAT)],
      ownAttributes: [{ id: 'attr-own', name: 'Volume' }],
    });
    await service.update('seller1', 'p1', { quantity: 3 } as never);
    expect(tx.productSpecification.deleteMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: expect.anything() } }));
    expect(tx.productSpecification.update).not.toHaveBeenCalled();
  });

  it('DOES delete a homeless foreign characteristic when the category changes', async () => {
    const { service, tx } = makeService({
      specs: [spec('s1', 'attr-foreign', 'Type de peau', OTHER_CAT)],
      ownAttributes: [{ id: 'attr-own', name: 'Taille' }],
    });
    await service.update('seller1', 'p1', { categoryId: NEW_CAT } as never);
    expect(tx.productSpecification.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['s1'] } } });
  });

  it('never repoints onto an attribute the product already holds (unique constraint)', async () => {
    const { service, tx } = makeService({
      specs: [
        spec('s1', 'attr-foreign', 'Volume', OTHER_CAT),
        spec('s2', 'attr-own', 'Volume', OWN_CAT),
      ],
      ownAttributes: [{ id: 'attr-own', name: 'Volume' }],
    });
    await service.update('seller1', 'p1', { quantity: 3 } as never);
    expect(tx.productSpecification.update).not.toHaveBeenCalled();
  });

  it('leaves a characteristic that already belongs to the product\'s category alone', async () => {
    const { service, tx } = makeService({
      specs: [spec('s1', 'attr-own', 'Volume', OWN_CAT)],
      ownAttributes: [{ id: 'attr-own', name: 'Volume' }],
    });
    await service.update('seller1', 'p1', { quantity: 3 } as never);
    expect(tx.productSpecification.update).not.toHaveBeenCalled();
    expect(tx.productSpecification.deleteMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: expect.anything() } }));
  });

  it('cannot repoint onto an INTERMEDIATE category — it has no legitimate attribute set', async () => {
    // childCount > 0 mirrors getCategoryAttributes returning []. Serving a
    // non-leaf node's own rows is what put cosmetics attributes on a shirt.
    const { service, tx } = makeService({
      specs: [spec('s1', 'attr-foreign', 'Volume', OTHER_CAT)],
      ownAttributes: [{ id: 'attr-own', name: 'Volume' }],
      childCount: 2,
    });
    await service.update('seller1', 'p1', { quantity: 3 } as never);
    expect(tx.productSpecification.update).not.toHaveBeenCalled();
  });

  it('skips rows the scoped replace already owns, so nothing is handled twice', async () => {
    // `resolveReplaceableAttributeIds` returns the payload's attribute ids; the
    // delete/create pass owns those rows.
    const { service, tx } = makeService({
      specs: [spec('s1', 'attr-payload', 'Volume', OTHER_CAT)],
      ownAttributes: [{ id: 'attr-own', name: 'Volume' }],
    });
    await service.update('seller1', 'p1', {
      specifications: [{ attributeId: 'attr-payload', value: '2L' }],
    } as never);
    expect(tx.productSpecification.update).not.toHaveBeenCalled();
    expect(tx.productSpecification.deleteMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: expect.anything() } }));
    expect(tx.productSpecification.deleteMany).toHaveBeenCalled();
  });

  it('a seller is never left trapped: after the update no foreign row remains without a reason', async () => {
    // Two foreign rows: one has a home (repointed), one does not and the
    // category changed (deleted). Neither can survive unreachable.
    const { service, tx } = makeService({
      specs: [
        spec('s1', 'attr-f1', 'Couleur', OTHER_CAT),
        spec('s2', 'attr-f2', 'Nombre de feux', OTHER_CAT),
      ],
      ownAttributes: [{ id: 'attr-own', name: 'Couleur' }],
    });
    await service.update('seller1', 'p1', { categoryId: NEW_CAT } as never);
    expect(tx.productSpecification.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { attributeId: 'attr-own' },
    });
    expect(tx.productSpecification.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['s2'] } } });
  });

  it('runs inside the same transaction as the product write', async () => {
    const { service, prisma } = makeService({
      specs: [spec('s1', 'attr-foreign', 'Volume', OTHER_CAT)],
      ownAttributes: [{ id: 'attr-own', name: 'Volume' }],
    });
    await service.update('seller1', 'p1', { quantity: 3 } as never);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does no work at all when the product has no specifications', async () => {
    const { service, prisma } = makeService({ specs: [] });
    await service.update('seller1', 'p1', { quantity: 3 } as never);
    expect(prisma.category.count).not.toHaveBeenCalled();
    expect(prisma.productAttribute.findMany).not.toHaveBeenCalled();
  });
});
