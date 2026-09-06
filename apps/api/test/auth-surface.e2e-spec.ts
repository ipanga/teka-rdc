import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { createTestApp, mockPrismaService, resetMocks } from './test-utils';

/**
 * D2a (2026-09-06) — the authenticated surface is bound to trusted state.
 *
 * Model under test: all three cookie namespaces share `.teka.cd`, so a browser
 * signed in on several surfaces sends ALL the cookies. Which one authenticates
 * is decided from the request Origin (exact match against the configured web
 * URLs) plus the account's stored role — never from `X-Teka-Surface`. Bearer
 * (mobile) requests carry no cookie and need no Origin.
 *
 * .env.test: BUYER_WEB_URL=http://localhost:5000, SELLER_WEB_URL=…:5100,
 * ADMIN_WEB_URL=…:5200, CORS_ORIGINS = those three.
 */
describe('Auth surface binding (e2e, D2a)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const BUYER = '10000000-0000-0000-0000-0000000000b1';
  const SELLER = '10000000-0000-0000-0000-0000000000c1';
  const ADMIN = '10000000-0000-0000-0000-0000000000d1';
  const users: Record<string, any> = {
    [BUYER]: { id: BUYER, role: 'BUYER', status: 'ACTIVE', phone: '+243999000001', email: null, deletedAt: null },
    [SELLER]: { id: SELLER, role: 'SELLER', status: 'ACTIVE', phone: null, email: 's@example.test', deletedAt: null },
    [ADMIN]: { id: ADMIN, role: 'ADMIN', status: 'ACTIVE', phone: null, email: 'a@example.test', deletedAt: null },
  };
  const ORIGIN = { buyer: 'http://localhost:5000', seller: 'http://localhost:5100', admin: 'http://localhost:5200' } as const;

  const token = (sub: string, role: string) => jwt.sign({ sub, role, phone: null, jti: `jti-${role}` });
  /** A browser signed in on every surface at once: every cookie is present. */
  const allCookies = () =>
    [
      `teka_buyer_access_token=${token(BUYER, 'BUYER')}`,
      `teka_seller_access_token=${token(SELLER, 'SELLER')}`,
      `teka_admin_access_token=${token(ADMIN, 'ADMIN')}`,
    ].join('; ');
  const me = () => request(app.getHttpServer()).get('/api/v1/auth/me');
  const adminOnly = () => request(app.getHttpServer()).get('/api/v1/payments/transactions');

  beforeAll(async () => {
    app = await createTestApp();
    jwt = app.get(JwtService, { strict: false });
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    resetMocks();
    mockPrismaService.user.findUnique.mockImplementation(async ({ where }: any) => users[where.id] ?? null);
    mockPrismaService.transaction.findMany.mockResolvedValue([]);
    mockPrismaService.transaction.count.mockResolvedValue(0);
  });

  describe('which cookie authenticates is chosen by the Origin, never by X-Teka-Surface', () => {
    it.each([
      ['buyer', BUYER, 'BUYER'],
      ['seller', SELLER, 'SELLER'],
      ['admin', ADMIN, 'ADMIN'],
    ] as const)('Origin of the %s app authenticates the %s session', async (surface, id, role) => {
      const res = await me().set('Cookie', allCookies()).set('Origin', ORIGIN[surface]).expect(200);
      expect(res.body.data.id).toBe(id);
      expect(res.body.data.role).toBe(role);
    });

    it.each([
      ['buyer', 'seller'],
      ['buyer', 'admin'],
      ['seller', 'buyer'],
      ['seller', 'admin'],
      ['admin', 'buyer'],
      ['admin', 'seller'],
    ] as const)('from the %s origin a forged X-Teka-Surface=%s changes nothing', async (from, forged) => {
      const expected = { buyer: BUYER, seller: SELLER, admin: ADMIN }[from];
      const res = await me()
        .set('Cookie', allCookies())
        .set('Origin', ORIGIN[from])
        .set('X-Teka-Surface', forged)
        .expect(200);
      expect(res.body.data.id).toBe(expected);
    });

    it('the storefront origin can never drive an admin-only route, whatever the header says', async () => {
      for (const header of ['admin', 'seller', 'buyer', 'ADMIN', '../admin', '']) {
        const req = adminOnly().set('Cookie', allCookies()).set('Origin', ORIGIN.buyer);
        if (header) req.set('X-Teka-Surface', header);
        await req.expect(403); // authenticated as the BUYER cookie → RolesGuard
      }
      await adminOnly().set('Cookie', allCookies()).set('Origin', ORIGIN.admin).expect(200);
    });

    it('a missing, unknown, malformed or spoofed Origin disables cookie authentication entirely', async () => {
      await me().set('Cookie', allCookies()).expect(401);
      for (const origin of [
        'https://evil.example',
        'http://localhost:5200.attacker.example',
        'http://attacker.example/localhost:5200',
        'http://localhost:52000',
        'https://localhost:5200',
        'null',
        'not a url',
      ]) {
        await me().set('Cookie', allCookies()).set('Origin', origin).set('X-Teka-Surface', 'admin').expect(401);
      }
    });

    it('a session planted in the wrong namespace is refused even from the matching origin', async () => {
      // A SELLER token placed in the buyer cookie, presented from the buyer origin.
      const res = await me()
        .set('Cookie', `teka_buyer_access_token=${token(SELLER, 'SELLER')}`)
        .set('Origin', ORIGIN.buyer)
        .expect(401);
      expect(res.body.error.message).toBe('Session invalide pour cette interface');
      // A BUYER token placed in the admin cookie, from the admin origin.
      await me()
        .set('Cookie', `teka_admin_access_token=${token(BUYER, 'BUYER')}`)
        .set('Origin', ORIGIN.admin)
        .expect(401);
    });

    it('the token role claim is not trusted either — the stored role wins', async () => {
      // A buyer token whose payload claims ADMIN: the DB says BUYER, so the
      // admin namespace refuses it and the buyer namespace treats it as a buyer.
      const forged = jwt.sign({ sub: BUYER, role: 'ADMIN', phone: null, jti: 'x' });
      await me().set('Cookie', `teka_admin_access_token=${forged}`).set('Origin', ORIGIN.admin).expect(401);
      const res = await me().set('Cookie', `teka_buyer_access_token=${forged}`).set('Origin', ORIGIN.buyer).expect(200);
      expect(res.body.data.role).toBe('BUYER');
      await adminOnly().set('Authorization', `Bearer ${forged}`).expect(403);
    });
  });

  describe('bearer (mobile) path is unchanged', () => {
    it('authenticates with no Origin and no surface header, from the stored role', async () => {
      const res = await me().set('Authorization', `Bearer ${token(SELLER, 'SELLER')}`).expect(200);
      expect(res.body.data.role).toBe('SELLER');
      await adminOnly().set('Authorization', `Bearer ${token(ADMIN, 'ADMIN')}`).expect(200);
      await adminOnly().set('Authorization', `Bearer ${token(BUYER, 'BUYER')}`).set('X-Teka-Surface', 'admin').expect(403);
    });

    it('a bearer request from an unknown origin is not affected by cookie rules', async () => {
      await me().set('Authorization', `Bearer ${token(BUYER, 'BUYER')}`).set('Origin', 'https://evil.example').expect(200);
    });
  });

  describe('cookies are written and cleared for the role’s own surface', () => {
    it('email login as ADMIN from any origin sets the admin cookies (Strict), never the buyer ones', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...users[ADMIN],
        passwordHash: '$2a$10$abcdefghijklmnopqrstuuA9G8O6b5e5s0K8Q1Yt3m4Xj7c3Y7oS1O', // any bcrypt-shaped hash
        authProvider: 'EMAIL_PASSWORD',
      });
      const bcrypt = require('bcrypt');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
      mockPrismaService.user.update.mockResolvedValue(users[ADMIN]);
      mockPrismaService.refreshToken.create.mockResolvedValue({});
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login/email')
        .set('Origin', ORIGIN.buyer)
        .set('X-Teka-Surface', 'buyer')
        .send({ email: 'a@example.test', password: 'Password123' })
        .expect(200);
      const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
      expect(cookies.some((c) => c.startsWith('teka_admin_access_token='))).toBe(true);
      expect(cookies.some((c) => c.startsWith('teka_buyer_'))).toBe(false);
      expect(cookies.find((c) => c.startsWith('teka_admin_access_token='))).toMatch(/SameSite=Strict/);
      (bcrypt.compare as jest.Mock).mockRestore?.();
    });

    it('logout clears the cookies of the session’s own surface', async () => {
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(null);
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', allCookies())
        .set('Origin', ORIGIN.seller)
        .set('X-Teka-Surface', 'admin')
        .expect(200);
      const cleared = ((res.headers['set-cookie'] as unknown as string[]) ?? []).map((c) => c.split('=')[0]);
      expect(cleared).toEqual(expect.arrayContaining(['teka_seller_access_token', 'teka_seller_refresh_token', 'teka_seller_session']));
      expect(cleared.some((n) => n.startsWith('teka_admin_'))).toBe(false);
    });

    it('cookie refresh reads the namespace of the Origin only', async () => {
      const refresh = jwt.sign({ sub: BUYER, role: 'BUYER', phone: null, jti: 'r1', type: 'refresh' }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d' } as any);
      // No Origin → the cookie is not read → 400 (token required).
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `teka_buyer_refresh_token=${refresh}`)
        .set('X-Teka-Surface', 'buyer')
        .send({})
        .expect(400);
      // Wrong origin for that namespace → the admin namespace has no cookie → 400.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `teka_buyer_refresh_token=${refresh}`)
        .set('Origin', ORIGIN.admin)
        .send({})
        .expect(400);
    });
  });
});
