import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { createTestApp, mockPrismaService, resetMocks } from './test-utils';

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
    const ORDER = '70000000-0000-0000-0000-000000000001';
    const BUYER_A = '10000000-0000-0000-0000-00000000000a';
    const BUYER_B = '10000000-0000-0000-0000-00000000000b';
    const SELLER = '10000000-0000-0000-0000-00000000000c';
    const ADMIN = '10000000-0000-0000-0000-00000000000d';
    const rows = [{ id: 'tx-1', orderId: ORDER, amountCDF: '1000', provider: 'COD' }];

    const bearer = (sub: string, role: string) => ({
      Authorization: `Bearer ${app
        .get(JwtService, { strict: false })
        .sign({ sub, role, phone: null, jti: 'e2e' })}`,
      'X-Teka-Surface': role === 'ADMIN' ? 'admin' : role === 'SELLER' ? 'seller' : 'buyer',
    });
    const asUser = (id: string, role: string) => ({
      id,
      role,
      status: 'ACTIVE',
      phone: null,
      email: `${id}@example.test`,
      deletedAt: null,
    });
    /** The order belongs to buyer A and seller SELLER; the mock honours the scoping predicate. */
    const primeOrder = () => {
      mockPrismaService.order.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.id !== ORDER) return null;
        if (where.buyerId && where.buyerId !== BUYER_A) return null;
        if (where.sellerId && where.sellerId !== SELLER) return null;
        return { id: ORDER };
      });
      mockPrismaService.transaction.findMany.mockResolvedValue(rows);
    };

    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/payments/orders/${ORDER}/transactions`)
        .expect(401);
    });

    // S4 (2026-09-06): the endpoint used to return any order's transactions to
    // any authenticated user. Ownership is now enforced server-side.
    it('returns the transactions to the buyer who owns the order', async () => {
      primeOrder();
      mockPrismaService.user.findUnique.mockResolvedValue(asUser(BUYER_A, 'BUYER'));
      const res = await request(app.getHttpServer())
        .get(`/api/v1/payments/orders/${ORDER}/transactions`)
        .set(bearer(BUYER_A, 'BUYER'))
        .expect(200);
      expect(res.body.data).toHaveLength(1);
    });

    it("returns 404 (not 403) to another buyer — the order's existence is not confirmed", async () => {
      primeOrder();
      mockPrismaService.user.findUnique.mockResolvedValue(asUser(BUYER_B, 'BUYER'));
      const res = await request(app.getHttpServer())
        .get(`/api/v1/payments/orders/${ORDER}/transactions`)
        .set(bearer(BUYER_B, 'BUYER'))
        .expect(404);
      expect(res.body.error.message).toBe('Commande non trouvée');
      expect(mockPrismaService.transaction.findMany).not.toHaveBeenCalled();
    });

    it('returns 404 to a seller who is not the order seller, 200 to the order seller', async () => {
      primeOrder();
      mockPrismaService.user.findUnique.mockResolvedValue(asUser(BUYER_B, 'SELLER'));
      await request(app.getHttpServer())
        .get(`/api/v1/payments/orders/${ORDER}/transactions`)
        .set(bearer(BUYER_B, 'SELLER'))
        .expect(404);
      mockPrismaService.user.findUnique.mockResolvedValue(asUser(SELLER, 'SELLER'));
      await request(app.getHttpServer())
        .get(`/api/v1/payments/orders/${ORDER}/transactions`)
        .set(bearer(SELLER, 'SELLER'))
        .expect(200);
    });

    it('returns 200 to an admin for any order', async () => {
      primeOrder();
      mockPrismaService.user.findUnique.mockResolvedValue(asUser(ADMIN, 'ADMIN'));
      await request(app.getHttpServer())
        .get(`/api/v1/payments/orders/${ORDER}/transactions`)
        .set(bearer(ADMIN, 'ADMIN'))
        .expect(200);
    });

    it('rejects a non-UUID order id with a French 400 before touching the DB', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(asUser(BUYER_A, 'BUYER'));
      await request(app.getHttpServer())
        .get('/api/v1/payments/orders/not-a-uuid/transactions')
        .set(bearer(BUYER_A, 'BUYER'))
        .expect(400);
      expect(mockPrismaService.order.findFirst).not.toHaveBeenCalled();
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
