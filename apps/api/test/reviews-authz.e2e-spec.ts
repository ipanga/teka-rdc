import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { createTestApp, mockPrismaService, resetMocks } from './test-utils';
import { VISIBLE_REVIEW_WHERE } from '../src/reviews/review-visibility';

/**
 * Reviews — server-side authorisation over the real HTTP stack (guards,
 * pipes, exception filter) with signed tokens and a scripted Prisma:
 *
 *  * only a BUYER may write a review at all;
 *  * a buyer cannot review on another buyer's order, cannot bypass the
 *    delivered-purchase check, cannot review the same product twice;
 *  * a buyer cannot edit or delete another buyer's review;
 *  * the public list and stats read with the ONE visibility predicate.
 *
 * Pre-scale audit, Buyer Mobile PR C (2026-09-06).
 */
const PRODUCT = '11111111-1111-4111-8111-111111111111';
const ORDER_A = '22222222-2222-4222-8222-222222222222';
const REVIEW_A = '33333333-3333-4333-8333-333333333333';
const BUYER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BUYER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SELLER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('Reviews (e2e) — authorisation + visibility', () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    app = await createTestApp();
    const jwt = app.get(JwtService, { strict: false });
    tokens[BUYER_A] = jwt.sign({ sub: BUYER_A, role: 'BUYER', phone: '+243999000101', jti: 'a' });
    tokens[BUYER_B] = jwt.sign({ sub: BUYER_B, role: 'BUYER', phone: '+243999000102', jti: 'b' });
    tokens[SELLER] = jwt.sign({ sub: SELLER, role: 'SELLER', email: 's@example.com', jti: 's' });
  });
  afterAll(async () => { await app.close(); });

  const auth = (id: string) => ({
    Authorization: `Bearer ${tokens[id]}`,
    'X-Teka-Surface': id === SELLER ? 'seller' : 'buyer',
  });

  beforeEach(() => {
    resetMocks();
    const m = mockPrismaService as unknown as Record<string, any>;
    // The guards resolve the caller from the token's sub; every id here exists.
    m.user.findUnique.mockImplementation(({ where, select }: { where: { id: string }; select?: { role?: boolean } }) => {
      const role = where.id === SELLER ? 'SELLER' : 'BUYER';
      return Promise.resolve(select?.role ? { role } : { id: where.id, role, status: 'ACTIVE', deletedAt: null });
    });
    m.$transaction = jest.fn((cb: (tx: unknown) => unknown) => (typeof cb === 'function' ? cb(mockPrismaService) : Promise.all(cb)));
    // Buyer A's review of the product, ACTIVE.
    m.review.findUnique.mockImplementation(({ where }: { where: { id?: string; buyerId_productId?: { buyerId: string } } }) => {
      if (where.id === REVIEW_A || where.buyerId_productId?.buyerId === BUYER_A) {
        return Promise.resolve({ id: REVIEW_A, buyerId: BUYER_A, productId: PRODUCT, orderId: ORDER_A, rating: 4, deletedAt: null, status: 'ACTIVE' });
      }
      return Promise.resolve(null);
    });
    // Only buyer A has a DELIVERED order containing the product.
    m.orderItem.findFirst.mockImplementation(({ where }: { where: { order: { buyerId: string } } }) =>
      Promise.resolve(where.order.buyerId === BUYER_A ? { orderId: ORDER_A } : null),
    );
    m.order.findFirst.mockImplementation(({ where }: { where: { id: string; buyerId: string } }) =>
      Promise.resolve(where.id === ORDER_A && where.buyerId === BUYER_A ? { id: ORDER_A } : null),
    );
    m.review.findMany.mockResolvedValue([]);
    m.review.count.mockResolvedValue(0);
    m.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: 0 });
    m.review.groupBy.mockResolvedValue([]);
    m.review.create.mockResolvedValue({ id: 'new', buyerId: BUYER_B, productId: PRODUCT, rating: 5, buyer: {} });
    m.review.update.mockResolvedValue({ id: REVIEW_A, buyer: {} });
    m.product.update.mockResolvedValue({});
    m.product.findUnique.mockResolvedValue({ sellerId: SELLER });
    m.sellerProfile.findUnique.mockResolvedValue({ id: 'sp' });
    m.sellerProfile.update.mockResolvedValue({});
  });

  const body = { productId: PRODUCT, orderId: ORDER_A, rating: 5, title: 'Très bon produit', text: 'Conforme.' };

  it('POST /v1/reviews without a session → 401', async () => {
    await request(app.getHttpServer()).post('/api/v1/reviews').send(body).expect(401);
  });

  it('POST /v1/reviews as a SELLER → 403 (buyers only)', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/reviews').set(auth(SELLER)).send(body).expect(403);
    expect(mockPrismaService.review.create).not.toHaveBeenCalled();
    expect(res.body.success).toBe(false);
  });

  it("POST /v1/reviews on another buyer's order → 400, nothing created", async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/reviews').set(auth(BUYER_B)).send(body).expect(400);
    expect(res.body.error.message).toBe('Vous devez avoir reçu ce produit avant de pouvoir laisser un avis');
    expect(mockPrismaService.review.create).not.toHaveBeenCalled();
  });

  it('POST /v1/reviews with a delivered order but a foreign orderId → 400, nothing created', async () => {
    const m = mockPrismaService as unknown as Record<string, any>;
    m.orderItem.findFirst.mockResolvedValue({ orderId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' });
    const res = await request(app.getHttpServer()).post('/api/v1/reviews').set(auth(BUYER_B)).send(body).expect(400);
    expect(res.body.error.message).toBe('Commande invalide ou ne contenant pas ce produit');
    expect(mockPrismaService.review.create).not.toHaveBeenCalled();
  });

  it('POST /v1/reviews twice for the same product → 400 (one review per buyer per product)', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/reviews').set(auth(BUYER_A)).send(body).expect(400);
    expect(res.body.error.message).toBe('Vous avez déjà laissé un avis pour ce produit');
    expect(mockPrismaService.review.create).not.toHaveBeenCalled();
  });

  it("PATCH /v1/reviews/:id on another buyer's review → 403, row untouched", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${REVIEW_A}`).set(auth(BUYER_B))
      .send({ rating: 1, title: 'Modifié par B' }).expect(403);
    expect(res.body.error.message).toBe('Vous ne pouvez modifier que vos propres avis');
    expect(mockPrismaService.review.update).not.toHaveBeenCalled();
  });

  it("DELETE /v1/reviews/:id on another buyer's review → 403, row untouched", async () => {
    const res = await request(app.getHttpServer()).delete(`/api/v1/reviews/${REVIEW_A}`).set(auth(BUYER_B)).expect(403);
    expect(res.body.error.message).toBe('Vous ne pouvez supprimer que vos propres avis');
    expect(mockPrismaService.review.update).not.toHaveBeenCalled();
  });

  it('PATCH cannot re-point productId/orderId (unknown fields rejected, 400)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${REVIEW_A}`).set(auth(BUYER_A))
      .send({ rating: 4, title: 'Toujours bien', productId: PRODUCT, orderId: ORDER_A }).expect(400);
    expect(mockPrismaService.review.update).not.toHaveBeenCalled();
  });

  it('the owner edits in place (200) and an empty comment clears the text', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${REVIEW_A}`).set(auth(BUYER_A))
      .send({ rating: 4, title: 'Toujours bien', text: '' }).expect(200);
    expect(mockPrismaService.review.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: REVIEW_A }, data: expect.objectContaining({ text: null, title: 'Toujours bien' }) }),
    );
  });

  it('GET list + stats are public and read with the visibility predicate', async () => {
    const m = mockPrismaService as unknown as Record<string, any>;
    await request(app.getHttpServer()).get(`/api/v1/reviews/products/${PRODUCT}`).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/reviews/products/${PRODUCT}/stats`).expect(200);
    const expectedWhere = { productId: PRODUCT, ...VISIBLE_REVIEW_WHERE };
    expect(m.review.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
    expect(m.review.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(m.review.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
  });
});
