import { ReviewsService } from './reviews.service';

// Minimal mocks — canReview() touches prisma.orderItem.findFirst (eligible
// DELIVERED order) and prisma.review.findUnique (existing-review guard). The
// seller-notification dep is unused by canReview().
function makeService(overrides?: {
  deliveredOrderItem?: unknown;
  existingReview?: unknown;
}) {
  const prisma = {
    orderItem: {
      findFirst: jest
        .fn()
        .mockResolvedValue(overrides?.deliveredOrderItem ?? null),
    },
    review: {
      findUnique: jest.fn().mockResolvedValue(overrides?.existingReview ?? null),
    },
  };
  const service = new ReviewsService(prisma as never, {} as never);
  return { service, prisma };
}

describe('ReviewsService.canReview', () => {
  it('is ineligible when the buyer has no DELIVERED order with the product', async () => {
    const { service } = makeService({ deliveredOrderItem: null });
    const res = await service.canReview('buyer1', 'prod1');
    expect(res.canReview).toBe(false);
    expect(res.orderId).toBeUndefined();
    expect(res.reason).toContain('reçu');
  });

  it('returns the eligible orderId so the client can POST a valid review', async () => {
    // Without this, CreateReviewDto.orderId is empty and every review 400s.
    const { service } = makeService({
      deliveredOrderItem: { orderId: 'order-123' },
      existingReview: null,
    });
    const res = await service.canReview('buyer1', 'prod1');
    expect(res.canReview).toBe(true);
    expect(res.orderId).toBe('order-123');
  });

  it('is ineligible when an active review already exists', async () => {
    const { service } = makeService({
      deliveredOrderItem: { orderId: 'order-123' },
      existingReview: { id: 'rev1', deletedAt: null },
    });
    const res = await service.canReview('buyer1', 'prod1');
    expect(res.canReview).toBe(false);
    expect(res.reason).toContain('déjà');
  });

  it('is eligible again after a soft-deleted review (deletedAt set)', async () => {
    const { service } = makeService({
      deliveredOrderItem: { orderId: 'order-456' },
      existingReview: { id: 'rev1', deletedAt: new Date() },
    });
    const res = await service.canReview('buyer1', 'prod1');
    expect(res.canReview).toBe(true);
    expect(res.orderId).toBe('order-456');
  });
});
