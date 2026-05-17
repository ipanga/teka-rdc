import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetMocks } from './test-utils';

/**
 * Seller-products endpoints — auth guards.
 *
 * Verifies that the new hard-delete route (added 2026-05-17 to plug
 * Cloudinary orphan leaks when sellers want a product gone for real
 * rather than archived) is properly auth-gated. Same 401 pattern as
 * the rest of /v1/sellers/products/*.
 */
describe('Seller Products (e2e)', () => {
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

  describe('DELETE /api/v1/sellers/products/:id (archive)', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .delete('/api/v1/sellers/products/30000000-0000-0000-0000-000000000001')
        .expect(401);
    });
  });

  describe('DELETE /api/v1/sellers/products/:id/hard (hard delete + Cloudinary purge)', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .delete(
          '/api/v1/sellers/products/30000000-0000-0000-0000-000000000001/hard',
        )
        .expect(401);
    });

    it('should return 401 with an invalid Bearer token', () => {
      return request(app.getHttpServer())
        .delete(
          '/api/v1/sellers/products/30000000-0000-0000-0000-000000000001/hard',
        )
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('POST /api/v1/sellers/products/:id/images (upload)', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .post(
          '/api/v1/sellers/products/30000000-0000-0000-0000-000000000001/images',
        )
        .expect(401);
    });
  });

  describe('DELETE /api/v1/sellers/products/:id/images/:imageId', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .delete(
          '/api/v1/sellers/products/30000000-0000-0000-0000-000000000001/images/40000000-0000-0000-0000-000000000001',
        )
        .expect(401);
    });
  });
});
