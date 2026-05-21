import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-utils';

/**
 * Device-token registration surface (PR A, 2026-05-21).
 *
 * Push notifications would be a major user-trust failure if the wrong
 * person could register / unregister tokens for someone else's account
 * — so the gates here are the most important part of the contract.
 * Both endpoints inherit the global JwtAuthGuard via NestJS module
 * defaults. Without an auth cookie / Bearer, every request should 401.
 */
describe('DeviceTokens (e2e) — auth-protection contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/users/device-tokens returns 401 without auth', async () => {
    return request(app.getHttpServer())
      .post('/api/v1/users/device-tokens')
      .send({
        token: 'fake-fcm-token-with-enough-length-to-satisfy-minlength-validator-xxxxxxxxx',
        platform: 'android',
      })
      .expect(401);
  });

  it('DELETE /api/v1/users/device-tokens/:token returns 401 without auth', async () => {
    return request(app.getHttpServer())
      .delete('/api/v1/users/device-tokens/anything')
      .expect(401);
  });
});
