import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-utils';

/**
 * Auth-protection contract for every `/v1/admin/reports/*` route — the order
 * ledger, the sales analytics and the search analytics.
 *
 * These routes expose commercial and behavioural data about the whole
 * marketplace, and until now they had NO HTTP-level coverage at all. A stranger
 * must not be able to read them, and neither must a buyer or a seller.
 *
 * Only the unauthenticated case is asserted here, deliberately: Nest runs
 * GUARDS BEFORE PIPES, so an anonymous request never reaches the DTO, and role
 * rejection needs a signed token this harness does not mint. Filter validation
 * therefore lives in `dto/report-query.dto.spec.ts`, and the 403-for-buyer /
 * 403-for-seller / 200-for-admin matrix was verified by hand against a running
 * API (recorded in docs/search-sales-analytics.md).
 *
 * The CSV routes are included on purpose: an export leaks the same data as the
 * JSON, and it is the easier one to forget.
 */
describe('Admin reports (e2e) — auth-protection contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const routes = [
    // Order ledger + finance
    '/api/v1/admin/reports/sales',
    '/api/v1/admin/reports/sales/csv',
    '/api/v1/admin/reports/financial',
    '/api/v1/admin/reports/financial/csv',
    '/api/v1/admin/reports/sellers',
    '/api/v1/admin/reports/sellers/csv',
    '/api/v1/admin/reports/payouts',
    '/api/v1/admin/reports/payouts/csv',
    // Sales analytics
    '/api/v1/admin/reports/sales/summary',
    '/api/v1/admin/reports/sales/breakdown',
    '/api/v1/admin/reports/sales/breakdown/csv',
    // Search analytics
    '/api/v1/admin/reports/search',
    '/api/v1/admin/reports/search/summary',
    '/api/v1/admin/reports/search/trending',
    '/api/v1/admin/reports/search/breakdown',
    '/api/v1/admin/reports/search/csv',
    // Synonym CRUD — the write surface for what search expands
    '/api/v1/admin/reports/search/synonyms',
  ];

  it.each(routes)('GET %s returns 401 without auth', (route) => {
    return request(app.getHttpServer()).get(route).expect(401);
  });

  // The synonym routes are the only WRITES under this namespace: a group that
  // leaked to an unauthenticated caller would let anyone reshape every buyer's
  // search results. Each verb is asserted separately — a guard is easy to wire
  // onto a controller's reads and miss on its writes.
  it('refuses every synonym WRITE without auth', async () => {
    const base = '/api/v1/admin/reports/search/synonyms';
    const id = '00000000-0000-4000-8000-000000000001';
    const server = app.getHttpServer();
    await request(server).post(base).send({ terms: ['a', 'b'] }).expect(401);
    await request(server).patch(`${base}/${id}`).send({ isActive: false }).expect(401);
    await request(server).patch(`${base}/${id}/deactivate`).expect(401);
    await request(server).patch(`${base}/${id}/activate`).expect(401);
    await request(server).delete(`${base}/${id}`).expect(401);
  });

  it('does not leak a synonym group to a bare Bearer token', () => {
    return request(app.getHttpServer())
      .get('/api/v1/admin/reports/search/synonyms')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('does not leak search analytics to a bare Bearer token', () => {
    return request(app.getHttpServer())
      .get('/api/v1/admin/reports/search')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });
});
