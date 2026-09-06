/**
 * D8 (2026-09-06) — authentication throttling, end to end.
 *
 * Identity-keyed limits (RateLimitService, AUTH_LIMITS) are exercised against
 * the in-memory store test-utils wires in (same atomic semantics as the
 * Postgres statement). The per-IP @nestjs/throttler backstop gets its own
 * app at the end because its in-memory counters would otherwise bleed into
 * every other case here.
 */
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, resetMocks, mockPrismaService } from './test-utils';
import { AUTH_LIMITS } from '../src/common/rate-limit/rate-limit.service';

const PHONE = '+243999000001';
const OTHER_PHONE = '+243999000002';

function expect429(res: request.Response) {
  expect(res.status).toBe(429);
  expect(res.body).toMatchObject({ success: false, error: { status: 429 } });
  expect(res.body.error.message).toMatch(/^(Trop de|Veuillez patienter)/);
  expect(res.headers['retry-after']).toMatch(/^\d+$/);
  expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  // Never leaks the threshold or the identifier.
  expect(JSON.stringify(res.body)).not.toMatch(/\d+ (tentatives|demandes)|\+243|@/);
}

describe('Auth throttling (e2e, D8)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    app = await createTestApp(); // listens once (see test-utils) — parallel bursts need a live server
    jwt = app.get(JwtService, { strict: false });
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    resetMocks();
    mockPrismaService.otp.findFirst.mockResolvedValue(null);
    mockPrismaService.otp.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaService.otp.create.mockResolvedValue({});
    mockPrismaService.otp.update.mockResolvedValue({});
    mockPrismaService.user.findFirst.mockResolvedValue(null);
  });

  const otpRequest = (phone: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/buyer/otp/request').send({ phone });
  const otpResend = (phone: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/buyer/otp/resend').send({ phone });
  const otpVerify = (phone: string, code: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/buyer/otp/verify').send({ phone, code });
  const login = (email: string, password = 'Wrong1234') =>
    request(app.getHttpServer()).post('/api/v1/auth/login/email').send({ email, password });

  // ---------------------------------------------------------------------------
  describe('OTP issuance — 3 per phone per 10 min, request + resend share the bucket', () => {
    it('sequential: 3 × 200 then 429; another phone is unaffected', async () => {
      for (let i = 0; i < AUTH_LIMITS.otpRequest.limit; i++) await otpRequest(PHONE).expect(200);
      expect429(await otpRequest(PHONE));
      expect429(await otpResend(PHONE));
      await otpRequest(OTHER_PHONE).expect(200);
      // Exactly 3 OTP rows created + 3 messages sent for PHONE, none for the refused calls.
      expect(mockPrismaService.otp.create).toHaveBeenCalledTimes(AUTH_LIMITS.otpRequest.limit + 1);
    });

    it('parallel burst of 12 yields exactly 3 × 200 (atomic counter, no overshoot)', async () => {
      const results = await Promise.all(Array.from({ length: 12 }, () => otpRequest(PHONE)));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 200)).toHaveLength(AUTH_LIMITS.otpRequest.limit);
      expect(statuses.filter((s) => s === 429)).toHaveLength(12 - AUTH_LIMITS.otpRequest.limit);
      expect(mockPrismaService.otp.create).toHaveBeenCalledTimes(AUTH_LIMITS.otpRequest.limit);
    });

    it('a non-buyer phone is counted identically and answers the same buyer-shaped 200 (no oracle)', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({ id: 'seller-1', role: 'SELLER', status: 'ACTIVE', phone: PHONE });
      for (let i = 0; i < AUTH_LIMITS.otpRequest.limit; i++) {
        const res = await otpRequest(PHONE).expect(200);
        expect(res.body.data).toEqual({ expiresInSeconds: expect.any(Number), cooldownSeconds: expect.any(Number) });
      }
      expect429(await otpRequest(PHONE));
      expect(mockPrismaService.otp.create).not.toHaveBeenCalled();
    });

    it('/request honours the 30 s resend cooldown of an active OTP (429 without consuming budget)', async () => {
      mockPrismaService.otp.findFirst.mockResolvedValue({
        id: 'otp-1', phone: PHONE, code: 'x'.repeat(64), attempts: 0,
        expiresAt: new Date(Date.now() + 300_000), createdAt: new Date(Date.now() - 2_000),
      });
      expect429(await otpRequest(PHONE));
      expect429(await otpResend(PHONE));
      expect(mockPrismaService.otp.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  describe('OTP verification — 10 calls per phone per 15 min', () => {
    const activeOtp = () => ({
      id: 'otp-1', phone: PHONE, code: 'f'.repeat(64), attempts: 0,
      expiresAt: new Date(Date.now() + 300_000), createdAt: new Date(),
    });

    it('wrong codes: 10 × 401 then 429 — even with a fresh OTP row; another phone unaffected', async () => {
      mockPrismaService.otp.findFirst.mockImplementation(async () => activeOtp());
      for (let i = 0; i < AUTH_LIMITS.otpVerify.limit; i++) await otpVerify(PHONE, '000000').expect(401);
      expect429(await otpVerify(PHONE, '000000'));
      await otpVerify(OTHER_PHONE, '000000').expect(401);
    });

    it('a parallel burst of 30 wrong codes never exceeds 10 lookups of the Otp row', async () => {
      mockPrismaService.otp.findFirst.mockImplementation(async () => activeOtp());
      const results = await Promise.all(Array.from({ length: 30 }, () => otpVerify(PHONE, '000000')));
      expect(results.filter((r) => r.status === 401)).toHaveLength(AUTH_LIMITS.otpVerify.limit);
      expect(results.filter((r) => r.status === 429)).toHaveLength(30 - AUTH_LIMITS.otpVerify.limit);
      expect(mockPrismaService.otp.findFirst).toHaveBeenCalledTimes(AUTH_LIMITS.otpVerify.limit);
    });

    it('the budget also covers buyer/claim/verify (shared verifyOtpInternal)', async () => {
      const claimToken = jwt.sign({ sub: 'buyer-legacy', type: 'buyer_phone_claim' });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'buyer-legacy', role: 'BUYER', deletedAt: null });
      mockPrismaService.otp.findFirst.mockImplementation(async () => activeOtp());
      const claim = () =>
        request(app.getHttpServer()).post('/api/v1/auth/buyer/claim/verify').send({ token: claimToken, phone: PHONE, code: '000000' });
      for (let i = 0; i < AUTH_LIMITS.otpVerify.limit; i++) await claim().expect(401);
      expect429(await claim());
    });
  });

  // ---------------------------------------------------------------------------
  describe('Email login — 10 failures per email per 15 min → 15 min lock', () => {
    let passwordHash: string;
    const seller = (email: string) => ({
      id: 'seller-1', phone: null, email, passwordHash, firstName: 'A', lastName: 'B',
      role: 'SELLER', status: 'ACTIVE', authProvider: 'EMAIL_PASSWORD', deletedAt: null,
    });
    beforeAll(async () => {
      passwordHash = await bcrypt.hash('Right1234', 4);
    });
    beforeEach(() => {
      mockPrismaService.user.update.mockResolvedValue({});
      mockPrismaService.refreshToken.create.mockResolvedValue({});
    });

    it('10 × 401 then 429 — and the RIGHT password is refused too while locked', async () => {
      mockPrismaService.user.findUnique.mockImplementation(async ({ where }: any) =>
        where.email === 'seller@example.test' ? seller(where.email) : null,
      );
      for (let i = 0; i < AUTH_LIMITS.login.limit; i++) await login('seller@example.test').expect(401);
      expect429(await login('seller@example.test'));
      const locked = await login('seller@example.test', 'Right1234');
      expect429(locked);
      expect(Number(locked.headers['retry-after'])).toBeLessThanOrEqual(AUTH_LIMITS.login.lockSeconds);
      // Another email on the same IP still works.
      mockPrismaService.user.findUnique.mockImplementation(async ({ where }: any) => seller(where.email));
      await login('other@example.test', 'Right1234').expect(200);
    });

    it('an unknown email is counted identically: same 401s, same 429, same copy (no existence oracle)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      let lastKnown: request.Response | undefined;
      for (let i = 0; i < AUTH_LIMITS.login.limit; i++) lastKnown = await login('ghost@example.test').expect(401);
      const res = await login('ghost@example.test');
      expect429(res);
      expect(lastKnown!.body.error.message).toBe('Email ou mot de passe invalide');
    });

    it('the lock key is the normalised email: case/whitespace variants share it', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      for (let i = 0; i < AUTH_LIMITS.login.limit; i++) await login('Seller@Example.test').expect(401);
      expect429(await login('  seller@example.test '));
    });

    it('a successful login clears the failure count', async () => {
      mockPrismaService.user.findUnique.mockImplementation(async ({ where }: any) => seller(where.email));
      for (let i = 0; i < AUTH_LIMITS.login.limit - 1; i++) await login('seller@example.test').expect(401);
      await login('seller@example.test', 'Right1234').expect(200);
      for (let i = 0; i < AUTH_LIMITS.login.limit - 1; i++) await login('seller@example.test').expect(401);
      await login('seller@example.test', 'Right1234').expect(200);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Password reset request — 3 per email per hour, known or unknown', () => {
    const reset = (email: string) => request(app.getHttpServer()).post('/api/v1/auth/password-reset/request').send({ email });

    it('unknown email: 3 × 200 (neutral) then 429', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      for (let i = 0; i < AUTH_LIMITS.passwordReset.limit; i++) {
        const res = await reset('ghost@example.test').expect(200);
        expect(res.body.data.message).toMatch(/Si un compte existe/);
      }
      expect429(await reset('ghost@example.test'));
    });

    it('known seller: 3 emails then 429 — no 4th token, no 4th email', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'seller-1', email: 'seller@example.test', role: 'SELLER', status: 'ACTIVE', deletedAt: null,
      });
      mockPrismaService.passwordResetToken.create.mockResolvedValue({});
      for (let i = 0; i < AUTH_LIMITS.passwordReset.limit; i++) await reset('seller@example.test').expect(200);
      expect429(await reset('seller@example.test'));
      expect(mockPrismaService.passwordResetToken.create).toHaveBeenCalledTimes(AUTH_LIMITS.passwordReset.limit);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Seller registration — 3 per email per hour', () => {
    it('an existing email answers 409 three times, then 429 (no unbounded probing)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1', email: 'taken@example.test' });
      const body = { email: 'taken@example.test', password: 'Passw0rd1', firstName: 'Ali', lastName: 'Bin' };
      for (let i = 0; i < AUTH_LIMITS.register.limit; i++) {
        await request(app.getHttpServer()).post('/api/v1/auth/register/email').send(body).expect(409);
      }
      expect429(await request(app.getHttpServer()).post('/api/v1/auth/register/email').send(body));
    });
  });

  // ---------------------------------------------------------------------------
  describe('Refresh — 60 per token per 15 min, keyed on the token itself', () => {
    it('a garbage token gets 60 × 401 then 429; a different token is unaffected', async () => {
      const refresh = (token: string) =>
        request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: token });
      for (let i = 0; i < AUTH_LIMITS.refresh.limit; i++) await refresh('not-a-jwt').expect(401);
      expect429(await refresh('not-a-jwt'));
      await refresh('another-garbage-token').expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  describe('CSV exports — 10 per admin per 10 min (@IdentityThrottle)', () => {
    const ADMIN_A = '10000000-0000-0000-0000-0000000000d1';
    const ADMIN_B = '10000000-0000-0000-0000-0000000000d2';
    const cookieFor = (id: string) =>
      `teka_admin_access_token=${jwt.sign({ sub: id, role: 'ADMIN', phone: null, jti: `jti-${id}` })}`;
    const csv = (id: string) =>
      request(app.getHttpServer())
        .get('/api/v1/admin/reports/sales/csv')
        .set('Origin', 'http://localhost:5200')
        .set('Cookie', cookieFor(id));
    const json = (id: string) =>
      request(app.getHttpServer())
        .get('/api/v1/admin/reports/sales')
        .set('Origin', 'http://localhost:5200')
        .set('Cookie', cookieFor(id));

    beforeEach(() => {
      mockPrismaService.user.findUnique.mockImplementation(async ({ where }: any) => ({
        id: where.id, role: 'ADMIN', status: 'ACTIVE', phone: null, email: 'a@example.test', deletedAt: null,
      }));
      mockPrismaService.order.count.mockResolvedValue(0);
      mockPrismaService.order.findMany.mockResolvedValue([]);
    });

    it('admin A: 10 CSVs then 429; the JSON report and admin B stay unaffected', async () => {
      for (let i = 0; i < AUTH_LIMITS.csvExport.limit; i++) expect((await csv(ADMIN_A)).status).toBe(200);
      expect429(await csv(ADMIN_A));
      expect((await json(ADMIN_A)).status).toBe(200);
      expect((await csv(ADMIN_B)).status).toBe(200);
    });
  });
});

describe('Per-IP backstop (@nestjs/throttler) — own app so its counters stay isolated', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());
  beforeEach(() => resetMocks());

  it('login: 60 distinct emails per IP per 15 min, then a French 429 with Retry-After', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 60; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login/email')
        .send({ email: `probe${i}@example.test`, password: 'Wrong1234' })
        .expect(401);
    }
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login/email')
      .send({ email: 'probe60@example.test', password: 'Wrong1234' });
    expect(res.status).toBe(429);
    expect(res.body.error.message).toBe('Trop de requêtes. Veuillez patienter avant de réessayer.');
    expect(res.headers['retry-after']).toMatch(/^\d+$/);
  }, 60_000); // 60 dummy bcrypt compares (cost 10) exceed the 5 s default under a loaded CI worker
});
