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

// ─── Review editing (2026-07-28) ────────────────────────────────────────
//
// Editing must update in place, must be owner-only, and must not become a
// laundering route for moderated content. These specs pin those guarantees.

function makeEditService(existing: unknown) {
  const update = jest.fn().mockResolvedValue({ id: 'rev1', buyer: {} });
  const prisma = {
    review: {
      findUnique: jest.fn().mockResolvedValue(existing),
      update,
      // recalculateRatings() paths — only reached when the rating changes.
      aggregate: jest.fn().mockResolvedValue({
        _avg: { rating: 4 },
        _count: { _all: 2 },
      }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    product: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ sellerId: 'seller1' }),
    },
    sellerProfile: {
      findUnique: jest.fn().mockResolvedValue({ id: 'sp1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    // Assigned after the literal: referencing `prisma` inside its own
    // initializer makes TS unable to infer the type (TS7022).
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (cb: (tx: unknown) => unknown) => cb(prisma),
  );
  const service = new ReviewsService(prisma as never, {} as never);
  return { service, prisma, update };
}

const OWNED = {
  id: 'rev1',
  buyerId: 'buyer1',
  productId: 'prod1',
  rating: 4,
  deletedAt: null,
};

const dto = { rating: 4, title: 'Bon produit', text: 'Conforme.' };

describe('ReviewsService.updateReview', () => {
  it('updates the existing row instead of creating a second review', async () => {
    const { service, prisma, update } = makeEditService(OWNED);
    await service.updateReview('buyer1', 'rev1', dto as never);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].where).toEqual({ id: 'rev1' });
    // The create path must never be reached — that is what would duplicate.
    expect((prisma.review as Record<string, unknown>).create).toBeUndefined();
  });

  it('refuses to edit another buyer’s review', async () => {
    const { service } = makeEditService({ ...OWNED, buyerId: 'someone-else' });
    await expect(
      service.updateReview('buyer1', 'rev1', dto as never),
    ).rejects.toThrow(/vos propres avis/i);
  });

  it('404s on a missing or soft-deleted review', async () => {
    const { service: missing } = makeEditService(null);
    await expect(
      missing.updateReview('buyer1', 'rev1', dto as never),
    ).rejects.toThrow(/non trouvé/i);

    const { service: deleted } = makeEditService({
      ...OWNED,
      deletedAt: new Date(),
    });
    await expect(
      deleted.updateReview('buyer1', 'rev1', dto as never),
    ).rejects.toThrow(/non trouvé/i);
  });

  it('never touches moderation status — a HIDDEN review stays hidden', async () => {
    // Otherwise a buyer could launder moderated content by editing it.
    const { service, update } = makeEditService(OWNED);
    await service.updateReview('buyer1', 'rev1', dto as never);

    expect(update.mock.calls[0][0].data).not.toHaveProperty('status');
  });

  it('does not let an edit re-point productId or orderId', async () => {
    const { service, update } = makeEditService(OWNED);
    await service.updateReview('buyer1', 'rev1', {
      ...dto,
      // Even if a client smuggles these past the DTO, they must not be written
      // — re-pointing would bypass the delivered-purchase eligibility check.
      productId: 'other-product',
      orderId: 'other-order',
    } as never);

    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('productId');
    expect(data).not.toHaveProperty('orderId');
  });

  it('trims the title and stores an empty comment as null', async () => {
    const { service, update } = makeEditService(OWNED);
    await service.updateReview('buyer1', 'rev1', {
      rating: 4,
      title: '  Bon produit  ',
      text: '   ',
    } as never);

    const data = update.mock.calls[0][0].data;
    expect(data.title).toBe('Bon produit');
    expect(data.text).toBeNull();
  });

  it('recalculates aggregates only when the rating actually changed', async () => {
    const same = makeEditService(OWNED);
    await same.service.updateReview('buyer1', 'rev1', dto as never);
    expect(same.prisma.review.aggregate).not.toHaveBeenCalled();

    const changed = makeEditService(OWNED);
    await changed.service.updateReview('buyer1', 'rev1', {
      ...dto,
      rating: 2,
    } as never);
    expect(changed.prisma.review.aggregate).toHaveBeenCalled();
  });
});

// The reviewer is exposed as `buyer` — never `user`.
//
// buyer-web's Review type declared `user`/`userId` from the original build, so
// every consumer type-checked cleanly against a field the API has never sent.
// `getReviewerName` then read `review.user.firstName` inside the review list's
// .map(), and since an exception there escapes to the route error boundary, the
// WHOLE product page rendered "Une erreur est survenue" — on any product with at
// least one review. It hid for months only because no product had one.
//
// buyer-web has no component-test harness, so this pins the API half of that
// contract: rename the relation here and this fails immediately.
describe('getProductReviews — reviewer shape is a contract', () => {
  function makeService(row: Record<string, unknown>) {
    const prisma = {
      review: {
        findMany: jest.fn().mockResolvedValue([row]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    return {
      prisma,
      service: new ReviewsService(prisma as never, {} as never),
    };
  }

  const ROW = {
    id: 'rev1',
    productId: 'prod1',
    buyerId: 'buyer1',
    rating: 5,
    title: null,
    text: 'Satisfait',
    buyer: { id: 'buyer1', firstName: 'Valéry', lastName: 'Ipanga' },
  };

  it('includes the reviewer under `buyer`, with the name fields clients render', async () => {
    const { prisma, service } = makeService(ROW);
    const res = await service.getProductReviews('prod1', {} as never);

    const include = prisma.review.findMany.mock.calls[0][0].include;
    expect(include).toHaveProperty('buyer');
    expect(include).not.toHaveProperty('user');
    expect(include.buyer.select).toMatchObject({
      firstName: true,
      lastName: true,
    });

    const first = (res.data as Record<string, unknown>[])[0];
    expect(first).toHaveProperty('buyer');
    expect(first).not.toHaveProperty('user');
  });

  it('still returns the row when the reviewer relation is absent', async () => {
    // Clients must degrade to a fallback name rather than throw, so the API
    // omitting a reviewer has to stay a survivable case end-to-end.
    const { service } = makeService({ ...ROW, buyer: null });
    const res = await service.getProductReviews('prod1', {} as never);
    expect((res.data as Record<string, unknown>[])[0].buyer).toBeNull();
  });
});
