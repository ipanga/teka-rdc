import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-utils';

/**
 * Payouts surface (Initiative #3 — Seller Payouts Operationalization).
 *
 * Payouts move real money, so the authz gates are the most important part of
 * the contract: a stranger must not be able to drive a payout's state machine,
 * read/write a seller's payout destination, or pull the finance reconciliation
 * export. Every endpoint inherits the global JwtAuthGuard; without an auth
 * cookie / Bearer, every request must 401. (The state-machine + wallet-integrity
 * behaviour is covered by the unit specs in src/payouts/payouts.service.spec.ts.)
 */
const UUID = '00000000-0000-0000-0000-000000000001';

describe('Payouts (e2e) — auth-protection contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Admin lifecycle transitions ───────────────────────────────────────
  it('POST /api/v1/admin/payouts/:id/approve returns 401 without auth', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/payouts/${UUID}/approve`)
      .expect(401);
  });

  it('POST /api/v1/admin/payouts/:id/process returns 401 without auth', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/payouts/${UUID}/process`)
      .expect(401);
  });

  it('POST /api/v1/admin/payouts/:id/complete returns 401 without auth', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/payouts/${UUID}/complete`)
      .send({ externalReference: 'MPESA-1' })
      .expect(401);
  });

  it('POST /api/v1/admin/payouts/:id/reject returns 401 without auth', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/payouts/${UUID}/reject`)
      .send({ reason: 'x' })
      .expect(401);
  });

  // ─── Seller request + destination ──────────────────────────────────────
  it('POST /api/v1/sellers/payouts returns 401 without auth', () => {
    return request(app.getHttpServer())
      .post('/api/v1/sellers/payouts')
      .send({ payoutMethod: 'M_PESA', payoutPhone: '+243970000001' })
      .expect(401);
  });

  it('GET /api/v1/sellers/payout-method returns 401 without auth', () => {
    return request(app.getHttpServer())
      .get('/api/v1/sellers/payout-method')
      .expect(401);
  });

  it('PATCH /api/v1/sellers/payout-method returns 401 without auth', () => {
    return request(app.getHttpServer())
      .patch('/api/v1/sellers/payout-method')
      .send({ payoutMethod: 'M_PESA', payoutPhone: '+243970000001' })
      .expect(401);
  });

  it('GET /api/v1/sellers/wallet returns 401 without auth', () => {
    return request(app.getHttpServer())
      .get('/api/v1/sellers/wallet')
      .expect(401);
  });

  // ─── Admin finance export ──────────────────────────────────────────────
  it('GET /api/v1/admin/reports/payouts/csv returns 401 without auth', () => {
    return request(app.getHttpServer())
      .get('/api/v1/admin/reports/payouts/csv')
      .expect(401);
  });
});
