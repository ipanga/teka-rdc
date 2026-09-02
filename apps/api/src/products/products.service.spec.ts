import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';

const APPROVED_SELLER = { userId: 'seller1', applicationStatus: 'APPROVED', cityId: null };

function makeService(over: Record<string, any> = {}) {
  const prisma = {
    // count = number of live child categories. 0 => leaf, which is what every
    // pre-existing test assumes (products may only attach to a leaf).
    category: {
      findUnique: jest.fn().mockResolvedValue({ id: 'cat1', name: 'Chemises', isActive: true, deletedAt: null }),
      count: jest.fn().mockResolvedValue(0),
    },
    productAttribute: { findMany: jest.fn().mockResolvedValue([]) },
    sellerProfile: { findUnique: jest.fn().mockResolvedValue(APPROVED_SELLER) },
    brand: { findFirst: jest.fn().mockResolvedValue({ id: 'brand1' }) },
    product: {
      findUnique: jest.fn().mockResolvedValue(null), // shortCode clash check → free
      create: jest.fn().mockResolvedValue({ id: 'p1', categoryId: 'cat1', status: 'DRAFT' }),
    },
    ...over,
  };
  const analytics = { capture: jest.fn() };
  const adminNotifications = { create: jest.fn().mockResolvedValue(undefined) };
  const service = new ProductsService(
    prisma as never,
    {} as never,
    analytics as never,
    adminNotifications as never,
  );
  return { service, prisma, adminNotifications };
}

const baseDto = {
  title: 'Tecno Spark',
  description: 'Smartphone',
  categoryId: '13000000-0000-0000-0000-000000000201',
  priceCDF: '38000000',
  quantity: 5,
  condition: 'NEW',
};

describe('ProductsService.create — brand handling', () => {
  it('passes brandId through to product.create when the brand exists', async () => {
    const { service, prisma } = makeService();
    await service.create('seller1', { ...baseDto, brandId: '15000000-0000-0000-0000-000000000003' } as never);
    expect(prisma.brand.findFirst).toHaveBeenCalled();
    const createArg = prisma.product.create.mock.calls[0][0];
    expect(createArg.data.brandId).toBe('15000000-0000-0000-0000-000000000003');
  });

  it('rejects an unknown brandId with 400 before creating', async () => {
    const { service, prisma } = makeService({
      brand: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.create('seller1', { ...baseDto, brandId: '15000000-0000-0000-0000-0000000000ff' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('creates without a brand (brandId undefined) when none is given', async () => {
    const { service, prisma } = makeService();
    await service.create('seller1', baseDto as never);
    expect(prisma.brand.findFirst).not.toHaveBeenCalled();
    expect(prisma.product.create.mock.calls[0][0].data.brandId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Discount price (per-product seller-set promo)
// ---------------------------------------------------------------------------
describe('ProductsService.create — discount price', () => {
  it('persists a valid discount (< price)', async () => {
    const { service, prisma } = makeService();
    await service.create('seller1', {
      ...baseDto,
      discountPriceCDF: '30000000',
    } as never);
    const data = prisma.product.create.mock.calls[0][0].data;
    expect(data.discountPriceCDF).toBe(30000000n);
    expect(data.discountPriceUSD).toBeNull();
  });

  it('stores null (no promo) when discount is omitted', async () => {
    const { service, prisma } = makeService();
    await service.create('seller1', baseDto as never);
    expect(prisma.product.create.mock.calls[0][0].data.discountPriceCDF).toBeNull();
  });

  it.each([
    ['equal to price', '38000000'],
    ['greater than price', '40000000'],
    ['zero', '0'],
  ])('rejects a discount %s (400)', async (_label, discountPriceCDF) => {
    const { service, prisma } = makeService();
    await expect(
      service.create('seller1', { ...baseDto, discountPriceCDF } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('rejects a USD discount with no USD price (400)', async () => {
    const { service } = makeService();
    await expect(
      service.create('seller1', {
        ...baseDto,
        discountPriceUSD: '1000',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ProductsService.update — edit-after-publish + discount', () => {
  const ACTIVE = {
    id: 'p1',
    sellerId: 'seller1',
    status: 'ACTIVE',
    priceCDF: 38000000n,
    priceUSD: null,
    discountPriceCDF: null,
    discountPriceUSD: null,
    categoryId: 'cat1',
  };

  function makeUpdateService(product: Record<string, unknown>) {
    const updateMock = jest
      .fn()
      .mockResolvedValue({ id: 'p1', status: product.status });
    const prisma = {
      category: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'cat1', isActive: true, deletedAt: null }),
      },
      brand: { findFirst: jest.fn().mockResolvedValue({ id: 'brand1' }) },
      product: {
        findUnique: jest.fn().mockResolvedValue(product),
        update: updateMock,
      },
      productSpecification: { deleteMany: jest.fn() },
      productStatusLog: { create: jest.fn() },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          product: { update: updateMock },
          productSpecification: { deleteMany: jest.fn() },
        }),
      ),
    };
    const service = new ProductsService(
      prisma as never,
      {} as never,
      { capture: jest.fn() } as never,
      { create: jest.fn() } as never,
    );
    return { service, updateMock };
  }

  it('allows price/discount/stock edits on a published (ACTIVE) product', async () => {
    const { service, updateMock } = makeUpdateService(ACTIVE);
    await service.update('seller1', 'p1', {
      priceCDF: '40000000',
      discountPriceCDF: '30000000',
      quantity: 10,
    } as never);
    const data = updateMock.mock.calls[0][0].data;
    expect(data.priceCDF).toBe(40000000n);
    expect(data.discountPriceCDF).toBe(30000000n);
    expect(data.quantity).toBe(10);
  });

  it('re-reviews (ACTIVE → PENDING_REVIEW) when a content field is edited on a published product', async () => {
    // D2: a content edit to a live product is allowed but re-enters moderation.
    const { service, updateMock } = makeUpdateService(ACTIVE);
    await service.update('seller1', 'p1', { title: 'Nouveau titre' } as never);
    const data = updateMock.mock.calls[0][0].data;
    expect(data.title).toBe('Nouveau titre');
    expect(data.status).toBe('PENDING_REVIEW');
  });

  it('keeps ACTIVE (no re-review) when only price/stock are edited', async () => {
    const { service, updateMock } = makeUpdateService(ACTIVE);
    await service.update('seller1', 'p1', { priceCDF: '40000000' } as never);
    const data = updateMock.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
  });

  it('rejects editing a SUSPENDED product (400)', async () => {
    const { service, updateMock } = makeUpdateService({
      id: 'p1',
      status: 'SUSPENDED',
    });
    await expect(
      service.update('seller1', 'p1', { title: 'x' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects a price drop to at/below an existing discount (400)', async () => {
    const { service } = makeUpdateService({
      ...ACTIVE,
      discountPriceCDF: 30000000n,
    });
    await expect(
      service.update('seller1', 'p1', { priceCDF: '25000000' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clears the discount when null is sent', async () => {
    const { service, updateMock } = makeUpdateService({
      ...ACTIVE,
      discountPriceCDF: 30000000n,
    });
    await service.update('seller1', 'p1', {
      discountPriceCDF: null,
    } as never);
    expect(updateMock.mock.calls[0][0].data.discountPriceCDF).toBeNull();
  });
});

// --- Lifecycle transitions: withdraw / restore / duplicate ---
function makeLifecycleService(product: Record<string, unknown> | null) {
  const updateMock = jest
    .fn()
    .mockImplementation((args) => ({ id: 'p1', ...args.data }));
  const prisma = {
    product: {
      findUnique: jest.fn().mockResolvedValue(product),
      update: updateMock,
    },
    productStatusLog: { create: jest.fn() },
  };
  const service = new ProductsService(
    prisma as never,
    {} as never,
    { capture: jest.fn() } as never,
    { create: jest.fn() } as never,
  );
  return { service, prisma, updateMock };
}

describe('ProductsService lifecycle transitions', () => {
  it('withdraw: PENDING_REVIEW → DRAFT', async () => {
    const { service, updateMock, prisma } = makeLifecycleService({
      id: 'p1',
      status: 'PENDING_REVIEW',
    });
    await service.withdraw('seller1', 'p1');
    expect(updateMock.mock.calls[0][0].data.status).toBe('DRAFT');
    expect(prisma.productStatusLog.create).toHaveBeenCalled();
  });

  it('withdraw: rejects a non-pending product (400)', async () => {
    const { service } = makeLifecycleService({ id: 'p1', status: 'ACTIVE' });
    await expect(service.withdraw('seller1', 'p1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('restore: ARCHIVED → DRAFT', async () => {
    const { service, updateMock } = makeLifecycleService({
      id: 'p1',
      status: 'ARCHIVED',
    });
    await service.restore('seller1', 'p1');
    expect(updateMock.mock.calls[0][0].data.status).toBe('DRAFT');
  });

  it('restore: rejects a non-archived product (400)', async () => {
    const { service } = makeLifecycleService({ id: 'p1', status: 'ACTIVE' });
    await expect(service.restore('seller1', 'p1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('submit: rejects a DRAFT product with zero images (400)', async () => {
    const { service } = makeLifecycleService({
      id: 'p1',
      status: 'DRAFT',
      images: [],
      priceCDF: BigInt(38000000),
    });
    await expect(
      service.submitForReview('seller1', 'p1'),
    ).rejects.toThrow('Le produit doit avoir au moins une image avant la soumission');
  });

  it('submit: rejects a non-DRAFT product (400)', async () => {
    const { service } = makeLifecycleService({
      id: 'p1',
      status: 'ACTIVE',
      images: [{ id: 'img1' }],
      priceCDF: BigInt(38000000),
    });
    await expect(
      service.submitForReview('seller1', 'p1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('submit: DRAFT with an image + price → PENDING_REVIEW', async () => {
    const { service, updateMock, prisma } = makeLifecycleService({
      id: 'p1',
      status: 'DRAFT',
      title: 'Tecno Spark',
      images: [{ id: 'img1' }],
      priceCDF: BigInt(38000000),
    });
    await service.submitForReview('seller1', 'p1');
    expect(updateMock.mock.calls[0][0].data.status).toBe('PENDING_REVIEW');
    expect(prisma.productStatusLog.create).toHaveBeenCalled();
  });
});

// ── Leaf-category invariant (Seller Catalog Taxonomy initiative) ────────────
// A men's shirt sat on « Mode > Homme » (an intermediate node) and therefore
// rendered that node's legacy rows — including "Type de peau". The taxonomy
// assumed leaf-only but enforced it nowhere.
const HOMME = '13000000-0000-0000-0000-000000000501';
const CHEMISES = '16000000-0000-0000-0000-000000050102';

function nonLeaf(name = 'Homme', id = HOMME) {
  return {
    category: {
      findUnique: jest.fn().mockResolvedValue({ id, name, isActive: true, deletedAt: null }),
      count: jest.fn().mockResolvedValue(8), // 8 live children => intermediate
    },
    productAttribute: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('ProductsService.create — leaf-category invariant', () => {
  it('rejects a product assigned to an intermediate category', async () => {
    const { service } = makeService(nonLeaf());
    await expect(
      service.create('seller1', { ...baseDto, categoryId: HOMME } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not create the product when the category is intermediate', async () => {
    const { service, prisma } = makeService(nonLeaf());
    await service
      .create('seller1', { ...baseDto, categoryId: HOMME } as never)
      .catch(() => undefined);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('names the offending category and does NOT guess a child leaf', async () => {
    const { service } = makeService(nonLeaf());
    const err = await service
      .create('seller1', { ...baseDto, categoryId: HOMME } as never)
      .catch((e: Error) => e);
    // « Homme » holds shirts, trousers, shoes… the leaf is not inferable.
    expect((err as Error).message).toContain('Homme');
    expect((err as Error).message).not.toContain('Chemises');
  });

  it('accepts a leaf category', async () => {
    const { service, prisma } = makeService();
    await service.create('seller1', { ...baseDto, categoryId: CHEMISES } as never);
    expect(prisma.product.create).toHaveBeenCalled();
  });
});

// ── Legacy specification preservation on update() ──────────────────────────
// Second defect found while root-causing the shirt: update() used to delete
// EVERY ProductSpecification row for the product, then recreate from the
// payload. The shirt's stored values hang off attribute rows owned by a
// DIFFERENT category, so no form renders them — yet one quantity edit would
// have wiped them. Deletion is now scoped to ids the API actually serves.
const KITCHEN_TAILLE = '14000000-0000-0000-0000-000000040101'; // legacy, foreign
const KITCHEN_COULEUR = '14000000-0000-0000-0000-000000040102';
const CHEMISES_TAILLE = '14000000-0000-0000-0000-000005010201'; // servable leaf

function makeUpdateService(over: Record<string, any> = {}) {
  const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const productUpdate = jest.fn().mockResolvedValue({ id: 'p1', specifications: [] });
  const tx = {
    productSpecification: { deleteMany },
    product: { update: productUpdate },
    productStatusLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    product: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'p1',
        sellerId: 'seller1',
        categoryId: HOMME, // legacy: sitting on an INTERMEDIATE node
        status: 'DRAFT',
        priceCDF: BigInt(1000),
        priceUSD: null,
        discountPriceCDF: null,
        discountPriceUSD: null,
        title: 't',
        description: 'd',
        brandId: null,
        condition: 'NEW',
      }),
      update: productUpdate,
    },
    category: {
      findUnique: jest.fn().mockResolvedValue({ id: HOMME, name: 'Homme', isActive: true, deletedAt: null }),
      count: jest.fn().mockResolvedValue(8), // intermediate
    },
    productAttribute: { findMany: jest.fn().mockResolvedValue([]) },
    productSpecification: { deleteMany },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
    ...over,
  };
  const service = new ProductsService(
    prisma as never,
    {} as never,
    { capture: jest.fn() } as never,
    { create: jest.fn().mockResolvedValue(undefined) } as never,
  );
  return { service, prisma, deleteMany };
}

describe('ProductsService.update — legacy specification preservation', () => {
  it('a quantity-only edit deletes NO specifications', async () => {
    const { service, deleteMany } = makeUpdateService();
    await service.update('seller1', 'p1', { quantity: 12 } as never);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('a price-only edit deletes NO specifications', async () => {
    const { service, deleteMany } = makeUpdateService();
    await service.update('seller1', 'p1', { priceCDF: '2000' } as never);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('a quantity-only edit on a legacy intermediate-category product is ALLOWED', async () => {
    const { service } = makeUpdateService();
    await expect(
      service.update('seller1', 'p1', { quantity: 3 } as never),
    ).resolves.toBeDefined();
  });

  it('never issues an unscoped delete of every row for the product', async () => {
    const { service, deleteMany } = makeUpdateService();
    await service.update('seller1', 'p1', {
      specifications: [{ attributeId: CHEMISES_TAILLE, value: 'L' }],
    } as never);
    const where = deleteMany.mock.calls[0][0].where;
    expect(where).toHaveProperty('attributeId');
    expect(where.attributeId).toHaveProperty('in');
  });

  it('scopes deletion to incoming ids only when the category is intermediate (nothing servable)', async () => {
    const { service, deleteMany } = makeUpdateService();
    await service.update('seller1', 'p1', {
      specifications: [{ attributeId: CHEMISES_TAILLE, value: 'L' }],
    } as never);
    expect(deleteMany.mock.calls[0][0].where.attributeId.in).toEqual([CHEMISES_TAILLE]);
  });

  it('leaves foreign/legacy rows OUT of the delete filter, so they survive', async () => {
    const { service, deleteMany } = makeUpdateService();
    await service.update('seller1', 'p1', {
      specifications: [{ attributeId: CHEMISES_TAILLE, value: 'L' }],
    } as never);
    const ids: string[] = deleteMany.mock.calls[0][0].where.attributeId.in;
    expect(ids).not.toContain(KITCHEN_TAILLE);
    expect(ids).not.toContain(KITCHEN_COULEUR);
  });

  it('on a LEAF category, deletes the servable set ∪ incoming ids', async () => {
    const { service, deleteMany } = makeUpdateService({
      category: {
        findUnique: jest.fn().mockResolvedValue({ id: CHEMISES, name: 'Chemises', isActive: true, deletedAt: null }),
        count: jest.fn().mockResolvedValue(0), // leaf
      },
      productAttribute: {
        findMany: jest.fn().mockResolvedValue([{ id: CHEMISES_TAILLE }]),
      },
    });
    await service.update('seller1', 'p1', {
      specifications: [{ attributeId: CHEMISES_TAILLE, value: 'L' }],
    } as never);
    const ids: string[] = deleteMany.mock.calls[0][0].where.attributeId.in;
    expect(ids).toContain(CHEMISES_TAILLE);
    expect(ids).not.toContain(KITCHEN_TAILLE); // foreign row still preserved
  });
});
