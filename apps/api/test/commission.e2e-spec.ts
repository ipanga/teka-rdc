import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-utils';

/**
 * Commission configuration (payouts / commission initiative, PR 5).
 *
 * Commission rates decide how much of every delivered sale Teka keeps, so the
 * authz gate is the contract that matters most: without an auth cookie /
 * Bearer, every endpoint — platform default, category rate, seller override,
 * history — must 401. Precedence, snapshotting and audit behaviour are covered
 * by the unit specs (commission.service.spec.ts, earnings.service.spec.ts).
 */
const UUID = '00000000-0000-0000-0000-000000000001';

describe('Commission (e2e) — auth-protection contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/admin/commission-settings returns 401 without auth', () => {
    return request(app.getHttpServer()).get('/api/v1/admin/commission-settings').expect(401);
  });

  it('GET /api/v1/admin/commission-settings/history returns 401 without auth', () => {
    return request(app.getHttpServer())
      .get('/api/v1/admin/commission-settings/history')
      .expect(401);
  });

  it('PUT /api/v1/admin/commission-settings returns 401 without auth', () => {
    return request(app.getHttpServer())
      .put('/api/v1/admin/commission-settings')
      .send({ rate: 0.1 })
      .expect(401);
  });

  it('GET /api/v1/admin/sellers/:id/commission returns 401 without auth', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/admin/sellers/${UUID}/commission`)
      .expect(401);
  });

  it('PUT /api/v1/admin/sellers/:id/commission returns 401 without auth', () => {
    return request(app.getHttpServer())
      .put(`/api/v1/admin/sellers/${UUID}/commission`)
      .send({ rate: 0.05 })
      .expect(401);
  });

  it('DELETE /api/v1/admin/sellers/:id/commission returns 401 without auth', () => {
    return request(app.getHttpServer())
      .delete(`/api/v1/admin/sellers/${UUID}/commission`)
      .expect(401);
  });
});
