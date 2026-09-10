import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BrandsService } from './brands.service';

function makeService(over: Record<string, unknown> = {}) {
  const tx = {
    brand: { update: jest.fn().mockResolvedValue({}) },
    brandCategory: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    product: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    brand: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'new-brand' }),
      update: jest.fn().mockResolvedValue({}),
    },
    brandCategory: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    product: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    category: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest
      .fn()
      .mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)),
    ...over,
  };
  const service = new BrandsService(prisma as never);
  return { service, prisma, tx };
}

describe('BrandsService.createBrand', () => {
  it('rejects a duplicate name/slug with 409', async () => {
    const { service, prisma } = makeService();
    prisma.brand.findFirst.mockResolvedValueOnce({ id: 'existing' }); // name/slug clash
    await expect(
      service.createBrand({ name: 'Samsung' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.brand.create).not.toHaveBeenCalled();
  });

  it('creates with slug derived from name + linked categories', async () => {
    const { service, prisma } = makeService();
    prisma.category.count.mockResolvedValue(2); // both categoryIds exist
    // getBrandById re-fetch after create
    prisma.brand.findFirst.mockImplementation((args: any) =>
      args?.where?.OR
        ? Promise.resolve(null) // clash check: free
        : Promise.resolve({
            id: 'new-brand',
            name: "L'Oréal",
            slug: 'l-oreal',
            logoUrl: null,
            isActive: true,
            sortOrder: 0,
            categories: [{ categoryId: 'c1' }, { categoryId: 'c2' }],
            _count: { products: 0 },
          }),
    );

    const res = await service.createBrand({
      name: "L'Oréal",
      categoryIds: ['c1', 'c2'],
    });

    expect(prisma.brand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "L'Oréal", slug: 'l-oreal' }),
      }),
    );
    expect(res.categoryIds).toEqual(['c1', 'c2']);
  });

  it('rejects unknown category ids', async () => {
    const { service, prisma } = makeService();
    prisma.brand.findFirst.mockResolvedValueOnce(null); // no clash
    prisma.category.count.mockResolvedValue(1); // only 1 of 2 exist
    await expect(
      service.createBrand({ name: 'X', categoryIds: ['c1', 'bad'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('BrandsService.mergeBrands', () => {
  it('reassigns products, absorbs links, soft-deletes the source', async () => {
    const { service, prisma, tx } = makeService();
    prisma.brand.findFirst
      .mockResolvedValueOnce({ id: 'src' }) // source
      .mockResolvedValueOnce({ id: 'tgt' }); // target
    tx.product.updateMany.mockResolvedValue({ count: 7 });
    tx.brandCategory.findMany.mockResolvedValue([{ categoryId: 'c1' }]);

    const res = await service.mergeBrands('src', 'tgt');

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { brandId: 'src' },
      data: { brandId: 'tgt' },
    });
    expect(tx.brandCategory.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ brandId: 'tgt', categoryId: 'c1' }],
        skipDuplicates: true,
      }),
    );
    expect(tx.brand.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'src' },
        data: expect.objectContaining({ isActive: false }),
      }),
    );
    expect(res).toEqual({
      merged: true,
      sourceId: 'src',
      targetId: 'tgt',
      productsMoved: 7,
    });
  });

  it('refuses merging a brand into itself', async () => {
    const { service } = makeService();
    await expect(service.mergeBrands('same', 'same')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('404s when the target brand is missing', async () => {
    const { service, prisma } = makeService();
    prisma.brand.findFirst
      .mockResolvedValueOnce({ id: 'src' }) // source exists
      .mockResolvedValueOnce(null); // target missing
    await expect(service.mergeBrands('src', 'tgt')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('BrandsService.softDelete', () => {
  it('drops category links and sets deletedAt', async () => {
    const { service, prisma, tx } = makeService();
    prisma.brand.findFirst.mockResolvedValue({ id: 'b1' });
    const res = await service.softDelete('b1');
    expect(tx.brandCategory.deleteMany).toHaveBeenCalledWith({
      where: { brandId: 'b1' },
    });
    expect(tx.brand.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(res).toEqual({ deleted: true });
  });

  it('404s on a missing brand', async () => {
    const { service } = makeService();
    await expect(service.softDelete('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

/**
 * Brand lookup for the 2026-09-10 taxonomy leaves (2026-09-11).
 *
 * The leaves shipped with ZERO `brand_categories` rows, so
 * `GET /v1/brands?categoryId=<leaf>` returned an empty list and the seller's
 * brand dropdown had no options at all — not even « Autre ». The data fix is
 * `2026-09-11_taxonomy_brand_links.sql`; these pin the QUERY that reads it, in
 * particular that the retired `__old__…` rows can never surface.
 */
describe('BrandsService.getActiveBrands — the new taxonomy leaves', () => {
  const SPIRITUEUX = '16000000-0000-0000-0000-000000010703';
  const BIERES = '16000000-0000-0000-0000-000000010701';
  const LAIT_INFANTILE = '16000000-0000-0000-0000-000000010503';

  it('scopes the lookup to brands linked to the requested leaf', async () => {
    const { service, prisma } = makeService();
    prisma.brand.findMany.mockResolvedValueOnce([
      { id: 'b54', name: 'Johnnie Walker', slug: 'johnnie-walker', logoUrl: null },
      { id: 'b1', name: 'Autre', slug: 'autre', logoUrl: null },
    ]);
    const res = await service.getActiveBrands(SPIRITUEUX);
    expect(res.map((b) => b.name)).toEqual(['Johnnie Walker', 'Autre']);
    expect(prisma.brand.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categories: { some: { categoryId: SPIRITUEUX } },
        }),
      }),
    );
  });

  it('never returns an inactive or soft-deleted brand', async () => {
    // The two `__old__…` rows occupying ids 50 and 51 in production are exactly
    // this: isActive=false + deletedAt set. Both filters must stay on the query,
    // or a retired Castrol row could appear in a seller's dropdown.
    const { service, prisma } = makeService();
    await service.getActiveBrands(BIERES);
    const where = prisma.brand.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.deletedAt).toBeNull();
  });

  it('an unrelated leaf is queried the same way, with its own id', async () => {
    // Lait infantile keeps whatever it had; nothing about the milk/alcohol fix
    // widens or narrows another category's lookup.
    const { service, prisma } = makeService();
    await service.getActiveBrands(LAIT_INFANTILE);
    expect(prisma.brand.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categories: { some: { categoryId: LAIT_INFANTILE } },
        }),
      }),
    );
  });

  it('omitting categoryId does not add a category filter', async () => {
    const { service, prisma } = makeService();
    await service.getActiveBrands();
    expect(prisma.brand.findMany.mock.calls[0][0].where).not.toHaveProperty('categories');
  });
});
