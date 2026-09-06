/**
 * D4 (2026-09-06) — HTTP security header contract of the JSON API.
 * The same applyHttpSecurity() runs in main.ts and here.
 */
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { createTestApp, resetMocks, mockPrismaService } from './test-utils';
import { API_CSP } from '../src/common/security/http-security';

describe('API security headers (e2e, D4)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    app = await createTestApp();
    jwt = app.get(JwtService, { strict: false });
  });
  afterAll(async () => app.close());
  beforeEach(() => resetMocks());

  function expectBaseline(res: request.Response) {
    expect(res.headers['content-security-policy']).toBe(API_CSP);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-powered-by']).toBeUndefined();
    // Transport policy belongs to nginx (TLS terminates there).
    expect(res.headers['strict-transport-security']).toBeUndefined();
  }

  it('200: a public JSON endpoint carries the baseline and no misleading browser CSP', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.status).toBe(200);
    expectBaseline(res);
    expect(res.headers['content-security-policy']).not.toContain('script-src');
    expect(res.headers['cache-control']).toBeUndefined();
  });

  it.each([
    ['404 unknown route', () => request(app.getHttpServer()).get('/api/v1/does-not-exist'), 404],
    ['401 protected route without a session', () => request(app.getHttpServer()).get('/api/v1/auth/me'), 401],
    ['400 validation error', () => request(app.getHttpServer()).post('/api/v1/auth/login/email').send({}), 400],
  ])('%s keeps every header', async (_name, call, status) => {
    const res = await call();
    expect(res.status).toBe(status);
    expectBaseline(res);
  });

  it('429 from the identity throttle keeps the headers and adds Retry-After', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).post('/api/v1/auth/password-reset/request').send({ email: 'h@example.test' }).expect(200);
    }
    const res = await request(app.getHttpServer()).post('/api/v1/auth/password-reset/request').send({ email: 'h@example.test' });
    expect(res.status).toBe(429);
    expectBaseline(res);
    expect(res.headers['retry-after']).toMatch(/^\d+$/);
  });

  describe('private responses are never cacheable', () => {
    const ADMIN = '10000000-0000-0000-0000-0000000000d1';
    beforeEach(() => {
      mockPrismaService.user.findUnique.mockImplementation(async ({ where }: any) =>
        where.id === ADMIN ? { id: ADMIN, role: 'ADMIN', status: 'ACTIVE', phone: null, email: 'a@example.test', deletedAt: null } : null,
      );
    });

    it('a bearer request gets Cache-Control: no-store (even when it fails)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', 'Bearer nope');
      expect(res.status).toBe(401);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('a cookie session gets no-store on a successful personal response', async () => {
      const token = jwt.sign({ sub: ADMIN, role: 'ADMIN', phone: null, jti: 'jti-a' });
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Origin', 'http://localhost:5200')
        .set('Cookie', `teka_admin_access_token=${token}`);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('a CSV export is a nosniff attachment that is not stored', async () => {
      const token = jwt.sign({ sub: ADMIN, role: 'ADMIN', phone: null, jti: 'jti-a' });
      mockPrismaService.order.count.mockResolvedValue(0);
      mockPrismaService.order.findMany.mockResolvedValue([]);
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/reports/sales/csv')
        .set('Origin', 'http://localhost:5200')
        .set('Cookie', `teka_admin_access_token=${token}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename=/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('an anonymous catalogue response keeps its default cache policy', async () => {
      mockPrismaService.city.findMany.mockResolvedValue([]);
      const res = await request(app.getHttpServer()).get('/api/v1/cities');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBeUndefined();
    });
  });
});
