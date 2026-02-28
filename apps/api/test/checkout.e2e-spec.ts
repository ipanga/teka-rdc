import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetMocks } from './test-utils';

/**
 * Checkout & Cart & Orders — Protected endpoint tests.
 *
 * These tests verify that:
 * 1. Protected endpoints return 401 without authentication
 * 2. Endpoints exist at the expected paths
 * 3. The auth guard is properly applied
 */
describe('Checkout & Cart & Orders (e2e)', () => {
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
  // POST /api/v1/checkout — requires BUYER role
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/checkout', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .post('/api/v1/checkout')
        .send({
          addressId: '40000000-0000-0000-0000-000000000001',
          paymentMethod: 'MOBILE_MONEY',
        })
        .expect(401);
    });

    it('should return 401 with an invalid Bearer token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/checkout')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          addressId: '40000000-0000-0000-0000-000000000001',
          paymentMethod: 'MOBILE_MONEY',
        })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Cart endpoints — require authentication
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/cart', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer()).get('/api/v1/cart').expect(401);
    });
  });

  describe('POST /api/v1/cart/items', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .send({
          productId: '30000000-0000-0000-0000-000000000001',
          quantity: 1,
        })
        .expect(401);
    });
  });

  describe('PATCH /api/v1/cart/items/:productId', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/cart/items/30000000-0000-0000-0000-000000000001')
        .send({ quantity: 2 })
        .expect(401);
    });
  });

  describe('DELETE /api/v1/cart/items/:productId', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .delete('/api/v1/cart/items/30000000-0000-0000-0000-000000000001')
        .expect(401);
    });
  });

  describe('DELETE /api/v1/cart', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer()).delete('/api/v1/cart').expect(401);
    });
  });

  describe('POST /api/v1/cart/merge', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .post('/api/v1/cart/merge')
        .send({ items: [] })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Order endpoints — require authentication
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/orders', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer()).get('/api/v1/orders').expect(401);
    });
  });

  describe('GET /api/v1/orders/:id', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .get('/api/v1/orders/70000000-0000-0000-0000-000000000001')
        .expect(401);
    });
  });

  describe('POST /api/v1/orders/:id/cancel', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .post('/api/v1/orders/70000000-0000-0000-0000-000000000001/cancel')
        .send({ reason: 'Changed my mind' })
        .expect(401);
    });
  });
});
