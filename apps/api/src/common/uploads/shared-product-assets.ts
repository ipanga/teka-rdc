import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Product image assets can be SHARED between products: `ProductsService.duplicate()`
 * copies each `ProductImage` row with the same `cloudinaryId`, so the clone and
 * its source point at one Cloudinary file. Destroying that file because ONE of
 * the rows went away breaks the other product's image.
 *
 * Call this AFTER the DB delete has committed: it returns only the ids that no
 * remaining `ProductImage` row references any more — the ones that are safe to
 * destroy. Callers keep the existing DB-first, Cloudinary-after ordering.
 */
export async function unreferencedProductAssetIds(
  prisma: Pick<PrismaService, 'productImage'>,
  cloudinaryIds: string[],
): Promise<string[]> {
  const unique = [...new Set(cloudinaryIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const stillReferenced = await prisma.productImage.findMany({
    where: { cloudinaryId: { in: unique } },
    select: { cloudinaryId: true },
    distinct: ['cloudinaryId'],
  });
  const keep = new Set(stillReferenced.map((r) => r.cloudinaryId));
  return unique.filter((id) => !keep.has(id));
}
