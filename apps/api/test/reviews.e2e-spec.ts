import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetMocks } from './test-utils';

/**
 * Reviews controller validation contract.
 *
 * Audit finding from 2026-05-17: the buyer-web PDP passed the URL slug
 * (e.g. "xbox-series-s-512go-lubumbashi-310000") to
 * `<ProductReviews productId={...}>` because the slug-based PDP route
 * stored the slug in params. The reviews controller validates :productId
 * with NestJS's `ParseUUIDPipe`, which rejected the slug with 400.
 * Reviews silently fell back to the "Aucun avis" empty state and hid
 * real reviews.
 *
 * The buyer-web side was fixed in PR #75 (pass `product.id` UUID). These
 * tests lock in the API-side contract so the validation can't silently
 * relax (e.g. someone swapping ParseUUIDPipe for plain `:productId`) and
 * mask future regressions in the buyer-web call sites.
 *
 * We only assert the 400 path because that's the regression we're
 * protecting against. The 200 happy path is exercised by the broader
 * reviews service tests.
 */
describe('Reviews (e2e) — productId UUID validation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMocks();
  });

  it('GET /api/v1/reviews/products/:productId/stats rejects a slug with 400', async () => {
    const slug = 'xbox-series-s-512go-lubumbashi-310000';
    return request(app.getHttpServer())
      .get(`/api/v1/reviews/products/${slug}/stats`)
      .expect(400);
  });

  it('GET /api/v1/reviews/products/:productId rejects a slug with 400', async () => {
    const slug = 'xbox-series-s-512go-lubumbashi-310000';
    return request(app.getHttpServer())
      .get(`/api/v1/reviews/products/${slug}?page=1&limit=10`)
      .expect(400);
  });
});
