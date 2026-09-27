import { unreferencedProductAssetIds } from './shared-product-assets';

function prismaWith(stillReferenced: string[]) {
  return {
    productImage: {
      findMany: jest
        .fn()
        .mockResolvedValue(stillReferenced.map((cloudinaryId) => ({ cloudinaryId }))),
    },
  };
}

describe('unreferencedProductAssetIds', () => {
  it('returns every id when no image row still references them', async () => {
    const prisma = prismaWith([]);
    await expect(
      unreferencedProductAssetIds(prisma as never, ['a', 'b']),
    ).resolves.toEqual(['a', 'b']);
  });

  it('keeps an id another product (a duplicate) still references', async () => {
    const prisma = prismaWith(['a']);
    await expect(
      unreferencedProductAssetIds(prisma as never, ['a', 'b']),
    ).resolves.toEqual(['b']);
  });

  it('de-duplicates and ignores empty ids, and skips the query when nothing is left', async () => {
    const prisma = prismaWith([]);
    await expect(
      unreferencedProductAssetIds(prisma as never, ['a', 'a', '']),
    ).resolves.toEqual(['a']);
    expect(prisma.productImage.findMany).toHaveBeenCalledWith({
      where: { cloudinaryId: { in: ['a'] } },
      select: { cloudinaryId: true },
      distinct: ['cloudinaryId'],
    });

    const empty = prismaWith([]);
    await expect(unreferencedProductAssetIds(empty as never, [])).resolves.toEqual([]);
    expect(empty.productImage.findMany).not.toHaveBeenCalled();
  });
});
