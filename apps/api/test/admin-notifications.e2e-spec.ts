import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-utils';

/**
 * Admin notification feed (product-submission notifications). Every endpoint
 * is @Roles('ADMIN') behind the global JwtAuthGuard — a stranger must not be
 * able to read the moderation inbox or mark notifications read. Without an auth
 * cookie / Bearer, every request must 401. (Service behaviour is covered by the
 * unit specs / the submitForReview emit.)
 */
const UUID = '00000000-0000-0000-0000-000000000001';

describe('Admin notifications (e2e) — auth-protection contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/admin/notifications returns 401 without auth', () => {
    return request(app.getHttpServer())
      .get('/api/v1/admin/notifications')
      .expect(401);
  });

  it('GET /api/v1/admin/notifications/unread-count returns 401 without auth', () => {
    return request(app.getHttpServer())
      .get('/api/v1/admin/notifications/unread-count')
      .expect(401);
  });

  it('PATCH /api/v1/admin/notifications/read-all returns 401 without auth', () => {
    return request(app.getHttpServer())
      .patch('/api/v1/admin/notifications/read-all')
      .expect(401);
  });

  it('PATCH /api/v1/admin/notifications/:id/read returns 401 without auth', () => {
    return request(app.getHttpServer())
      .patch(`/api/v1/admin/notifications/${UUID}/read`)
      .expect(401);
  });
});
