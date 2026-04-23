import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetMocks } from './test-utils';

/**
 * Payments — endpoint existence and auth guard tests.
 *
 * Verifies:
 * 1. Protected payment endpoints return 401 without authentication
 * 2. The Flexpay webhook is publicly accessible (no auth required)
 * 3. Endpoints exist at the expected paths
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
  // POST /api/v1/payments/initiate — requires BUYER role
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/payments/initiate', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .send({
          orderId: '70000000-0000-0000-0000-000000000001',
          mobileMoneyProvider: 'M_PESA',
          payerPhone: '+243999000001',
        })
        .expect(401);
    });

    it('should return 401 with an invalid Bearer token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          orderId: '70000000-0000-0000-0000-000000000001',
          mobileMoneyProvider: 'M_PESA',
          payerPhone: '+243999000001',
        })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/payments/webhook/flexpay — public endpoint
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/payments/webhook/flexpay', () => {
    it('should accept POST requests (public endpoint)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/webhook/flexpay')
        .send({ code: '0', orderNumber: 'TK-TEST-001' });

      // The webhook is public and should NOT return 401 or 404
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
      expect(res.status).not.toBe(405);
    });

    it('should return received:true for a request without valid signature', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/webhook/flexpay')
        .send({ code: '0', orderNumber: 'TK-TEST-002' })
        .expect(200);

      // Response is wrapped by ResponseInterceptor: { success: true, data: { received, processed } }
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('received', true);
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
