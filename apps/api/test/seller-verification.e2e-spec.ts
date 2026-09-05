import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-utils';

/**
 * Seller verification (PR 2) — auth-protection contract. Every route sits
 * behind the global JwtAuthGuard + RolesGuard; without a cookie / Bearer each
 * request must 401 and never touch storage. There is NO public route: the
 * buyer/browse API exposes no document field at all (see browse.service.spec).
 */
const UUID = '00000000-0000-0000-0000-000000000001';

describe('Seller verification (e2e) — auth-protection contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/sellers/verification returns 401 without auth', () =>
    request(app.getHttpServer()).get('/api/v1/sellers/verification').expect(401));

  it('POST /api/v1/sellers/verification/documents returns 401 without auth (no upload happens)', () =>
    request(app.getHttpServer())
      .post('/api/v1/sellers/verification/documents')
      .attach('document', Buffer.from('%PDF-1.4\n%%EOF\n'), 'rccm.pdf')
      .field('type', 'RCCM')
      .expect(401));

  it('GET /api/v1/admin/sellers/:id/verification returns 401 without auth', () =>
    request(app.getHttpServer()).get(`/api/v1/admin/sellers/${UUID}/verification`).expect(401));

  it('GET /api/v1/admin/sellers/:id/verification/documents/:docId/url returns 401 without auth', () =>
    request(app.getHttpServer())
      .get(`/api/v1/admin/sellers/${UUID}/verification/documents/${UUID}/url`)
      .expect(401));

  for (const action of ['approve', 'reject', 'revoke']) {
    it(`POST /api/v1/admin/sellers/:id/verification/${action} returns 401 without auth`, () =>
      request(app.getHttpServer())
        .post(`/api/v1/admin/sellers/${UUID}/verification/${action}`)
        .send({ reason: 'Documents illisibles' })
        .expect(401));
  }

  it('GET /api/v1/admin/sellers/applications?verification=PENDING_REVIEW (the review queue) returns 401 without auth', () =>
    request(app.getHttpServer())
      .get('/api/v1/admin/sellers/applications?verification=PENDING_REVIEW')
      .expect(401));

  it('the legacy application-photo link is also protected', () =>
    request(app.getHttpServer())
      .get(`/api/v1/admin/sellers/applications/${UUID}/document`)
      .expect(401));
});
