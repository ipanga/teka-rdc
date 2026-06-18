import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-utils';

/**
 * Seller in-app notification feed. Every endpoint is scoped to the
 * authenticated user (via the global JwtAuthGuard + @CurrentUser) — a stranger
 * must not be able to read or mark notifications. Without an auth cookie /
 * Bearer, every request must 401. (Per-user scoping behaviour is covered by
 * user-notification.service.spec.ts.)
 */
const UUID = '00000000-0000-0000-0000-000000000001';

describe('Seller notifications (e2e) — auth-protection contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/seller/notifications returns 401 without auth', () => {
    return request(app.getHttpServer())
      .get('/api/v1/seller/notifications')
      .expect(401);
  });

  it('GET /api/v1/seller/notifications/unread-count returns 401 without auth', () => {
    return request(app.getHttpServer())
      .get('/api/v1/seller/notifications/unread-count')
      .expect(401);
  });

  it('PATCH /api/v1/seller/notifications/read-all returns 401 without auth', () => {
    return request(app.getHttpServer())
      .patch('/api/v1/seller/notifications/read-all')
      .expect(401);
  });

  it('PATCH /api/v1/seller/notifications/:id/read returns 401 without auth', () => {
    return request(app.getHttpServer())
      .patch(`/api/v1/seller/notifications/${UUID}/read`)
      .expect(401);
  });
});
