import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetMocks } from './test-utils';

/**
 * Payments — endpoint existence and auth guard tests for the COD-only
 * payment surface (since 2026-05-26, PR B2 of the Orange/AT/Flexpay
 * removal initiative).
 *
 * The `POST /api/v1/payments/initiate` + `POST /api/v1/payments/webhook/flexpay`
 * endpoints were removed with Flexpay; their absence (404) is asserted
 * below so a future re-introduction would have to consciously update
 * this guard.
 */
describe('Payments (e2e)', () => {
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

  // ---------------------------------------------------------------------------
  // Removed endpoints — should 404
  // ---------------------------------------------------------------------------
  describe('removed Mobile Money + Flexpay endpoints', () => {
    it('POST /api/v1/payments/initiate should return 404', () => {
      return request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .send({})
        .expect(404);
    });

    it('POST /api/v1/payments/webhook/flexpay should return 404', () => {
      return request(app.getHttpServer())
        .post('/api/v1/payments/webhook/flexpay')
        .send({ code: '0', orderNumber: 'TK-TEST-001' })
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/payments/orders/:orderId/transactions — requires auth
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/payments/orders/:orderId/transactions', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .get(
          '/api/v1/payments/orders/70000000-0000-0000-0000-000000000001/transactions',
        )
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/payments/transactions — requires ADMIN role
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/payments/transactions', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .get('/api/v1/payments/transactions')
        .expect(401);
    });
  });
});
