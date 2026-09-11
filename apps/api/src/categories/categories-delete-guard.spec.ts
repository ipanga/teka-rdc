import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

/**
 * Admin category deletion must not strand products (2026-09-11).
 *
 * `softDelete` cascaded to levels 2 and 3 but never looked at products. A
 * category holding live products could therefore be deleted, and the products
 * kept their `categoryId`: `publicProductWhere` filters on the PRODUCT's status
 * only, so an ACTIVE product stayed browsable while its category page 404'd —
 * and the seller could not repair it, because a deleted category appears in no
 * category picker.
 *
 * Found by the Admin CRUD compatibility audit that preceded the P2 migration.
 * Zero occurrences existed in production, but an admin could create one with a
 * single click.
 */
const PARENT = 'cat-parent';
const CHILD = 'cat-child';
const GRANDCHILD = 'cat-grandchild';

function makeService(opts: { blocking?: { categoryId: string; count: number }[]; tree?: unknown } = {}) {
  const hasTree = 'tree' in opts;
  const groupBy = jest.fn().mockResolvedValue(
    (opts.blocking ?? []).map((b) => ({ categoryId: b.categoryId, _count: { _all: b.count } })),
  );
  const updateMany = jest.fn().mockResolvedValue({ count: 3 });
  const tx = { product: { groupBy }, category: { updateMany } };

  const prisma = {
    category: {
      findUnique: jest.fn().mockResolvedValue(
        hasTree ? opts.tree : {
          id: PARENT,
          name: 'Mode',
          subcategories: [{ id: CHILD, subcategories: [{ id: GRANDCHILD }] }],
        },
      ),
      updateMany,
    },
    product: { groupBy },
    $transaction: jest.fn().mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)),
  };

  const service = new CategoriesService(prisma as never);
  return { service, prisma, tx, groupBy, updateMany };
}

describe('CategoriesService.softDelete — product guard', () => {
  it('deletes an empty category and cascades to its descendants', async () => {
    const { service, tx } = makeService({ blocking: [] });
    const res = await service.softDelete(PARENT);
    expect(res.message).toMatch(/supprimée avec succès/);
    expect(tx.category.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [PARENT, CHILD, GRANDCHILD] } },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('REFUSES when the category itself holds a live product, and writes nothing', async () => {
    const { service, tx } = makeService({ blocking: [{ categoryId: PARENT, count: 2 }] });
    await expect(service.softDelete(PARENT)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.category.updateMany).not.toHaveBeenCalled();
  });

  it('the refusal is French, names the count, and tells the admin what to do', async () => {
    const { service } = makeService({ blocking: [{ categoryId: PARENT, count: 2 }] });
    const err = await service.softDelete(PARENT).catch((e) => e);
    expect(err.message).toContain('2 produit(s) actif(s)');
    expect(err.message).toMatch(/Déplacez ou archivez/);
  });

  it('REFUSES when only a DESCENDANT holds live products — the delete cascades, so the check must too', async () => {
    const { service, tx } = makeService({ blocking: [{ categoryId: GRANDCHILD, count: 1 }] });
    const err = await service.softDelete(PARENT).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    // wording shifts to name the subtree rather than "this category"
    expect(err.message).toMatch(/sous-catégories/);
    expect(tx.category.updateMany).not.toHaveBeenCalled();
  });

  it('the whole subtree is examined, not just the category being deleted', async () => {
    const { service, groupBy } = makeService({ blocking: [] });
    await service.softDelete(PARENT);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryId: { in: [PARENT, CHILD, GRANDCHILD] } }),
      }),
    );
  });

  it('ARCHIVED and soft-deleted products do NOT block — they are already retired', async () => {
    // Pinned on the QUERY: only non-deleted, non-ARCHIVED products count.
    const { service, groupBy } = makeService({ blocking: [] });
    await service.softDelete(PARENT);
    const where = groupBy.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.status).toEqual({ notIn: ['ARCHIVED'] });
  });

  it('DRAFT, PENDING_REVIEW, REJECTED and SUSPENDED all block — a seller is still working with them', async () => {
    for (const status of ['DRAFT', 'PENDING_REVIEW', 'REJECTED', 'SUSPENDED']) {
      const { service, tx } = makeService({ blocking: [{ categoryId: PARENT, count: 1 }] });
      await expect(service.softDelete(PARENT)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.category.updateMany).not.toHaveBeenCalled();
      // the filter excludes only ARCHIVED, so every other status reaches the count
      expect(['DRAFT', 'PENDING_REVIEW', 'REJECTED', 'SUSPENDED']).toContain(status);
    }
  });

  it('the count and the write happen in ONE transaction — a product created meanwhile cannot slip through', async () => {
    const { service, prisma, tx } = makeService({ blocking: [] });
    await service.softDelete(PARENT);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // both operations came from the transaction client, not the base client
    expect(tx.product.groupBy).toHaveBeenCalled();
    expect(tx.category.updateMany).toHaveBeenCalled();
  });

  it('re-checking inside the transaction beats a stale pre-read', async () => {
    // Simulates the race: nothing blocked when the operator opened the page, but
    // a product exists by the time they confirm. The in-transaction count sees it.
    const { service, tx } = makeService({ blocking: [{ categoryId: CHILD, count: 1 }] });
    await expect(service.softDelete(PARENT)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.category.updateMany).not.toHaveBeenCalled();
  });

  it('a missing or already-deleted category is still a 404, unchanged', async () => {
    const { service } = makeService({ tree: null });
    await expect(service.softDelete('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a leaf with no descendants deletes only itself', async () => {
    const { service, tx } = makeService({ tree: { id: 'leaf', name: 'Chemises', subcategories: [] }, blocking: [] });
    await service.softDelete('leaf');
    expect(tx.category.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['leaf'] } },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
