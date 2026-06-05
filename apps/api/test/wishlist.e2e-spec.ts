import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-utils';

/**
 * Wishlist endpoint surface contract.
 *
 * Audit finding from 2026-05-17 (companion to reviews.e2e-spec.ts): the
 * buyer-web `<WishlistButton>` on the PDP passed the URL slug to the
 * wishlist endpoints. The controller validates `:productId` with
 * `ParseUUIDPipe`, but the AuthGuard runs FIRST so unauthenticated
 * requests get 401 — which is what we can assert here without a real
 * session cookie. Locking in the auth-protection contract catches any
 * regression that accidentally drops `@UseGuards(JwtAuthGuard)`.
 *
 * The buyer-web side (passing the UUID, not the slug) was fixed in
 * PR #75.
 */
describe('Wishlist (e2e) — auth-protection contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/wishlist returns 401 without auth', async () => {
    return request(app.getHttpServer()).get('/api/v1/wishlist').expect(401);
  });

  it('POST /api/v1/wishlist/:productId returns 401 without auth', async () => {
    const uuid = '31000000-0000-0000-0000-000000000058';
    return request(app.getHttpServer())
      .post(`/api/v1/wishlist/${uuid}`)
      .expect(401);
  });

  it('DELETE /api/v1/wishlist/:productId returns 401 without auth', async () => {
    const uuid = '31000000-0000-0000-0000-000000000058';
    return request(app.getHttpServer())
      .delete(`/api/v1/wishlist/${uuid}`)
      .expect(401);
  });

  it('GET /api/v1/wishlist/count returns 401 without auth', async () => {
    return request(app.getHttpServer())
      .get('/api/v1/wishlist/count')
      .expect(401);
  });

  it('GET /api/v1/wishlist/check returns 401 without auth', async () => {
    return request(app.getHttpServer())
      .get(
        '/api/v1/wishlist/check?productIds=31000000-0000-0000-0000-000000000058',
      )
      .expect(401);
  });
});
