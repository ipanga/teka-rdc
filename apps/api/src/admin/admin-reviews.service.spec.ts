import { AdminReviewsService } from './admin-reviews.service';
import { VISIBLE_REVIEW_WHERE } from '../reviews/review-visibility';

// Admin moderation must move a review in and out of the public list, the
// count and the average AT THE SAME TIME — the caches are recalculated with the
// same visibility predicate the buyer-facing reads use.
function makeService(existing: unknown) {
  const prisma = {
    review: {
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 'rev1', ...(data as object) })),
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 3 }, _count: 1 }),
    },
    product: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ sellerId: 'seller1' }),
    },
    sellerProfile: {
      findUnique: jest.fn().mockResolvedValue({ id: 'sp1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
  return { service: new AdminReviewsService(prisma as never), prisma };
}

const ROW = { id: 'rev1', productId: 'prod1', status: 'ACTIVE', deletedAt: null };

describe('AdminReviewsService moderation ↔ visibility', () => {
  it.each([
    ['hideReview', 'HIDDEN'],
    ['unhideReview', 'ACTIVE'],
  ] as const)('%s sets status %s and recalculates product + seller caches with the visibility predicate', async (method, status) => {
    const { service, prisma } = makeService(ROW);
    const res = await service[method]('rev1');
    expect(res).toMatchObject({ status });
    expect(prisma.review.aggregate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { productId: 'prod1', ...VISIBLE_REVIEW_WHERE } }),
    );
    expect(prisma.review.aggregate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { product: { sellerId: 'seller1' }, ...VISIBLE_REVIEW_WHERE } }),
    );
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'prod1' }, data: { avgRating: 3, totalReviews: 1 } }),
    );
    expect(prisma.sellerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sp1' }, data: { avgRating: 3, totalReviews: 1 } }),
    );
  });

  it('deleteReview soft-deletes and recalculates the same way', async () => {
    const { service, prisma } = makeService(ROW);
    await service.deleteReview('rev1');
    expect(prisma.review.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );
    expect(prisma.review.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: 'prod1', ...VISIBLE_REVIEW_WHERE } }),
    );
  });

  it('404s (French) on a missing or already-deleted review', async () => {
    const { service } = makeService(null);
    await expect(service.hideReview('rev1')).rejects.toMatchObject({ status: 404, message: 'Avis non trouvé' });
  });
});
