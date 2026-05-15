import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, resetMocks, mockPrismaService } from './test-utils';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMocks();
  });

  // ---------------------------------------------------------------------------
  // Removed endpoints — assert 404 so a regression that re-adds them is caught.
  // - Phone-OTP auth removed 2026-05-12 (re-introduced for buyers only via
  //   WhatsApp OTP on 2026-05-15 — see /buyer/otp/* below).
  // - Google login removed April 2026.
  // - Email-OTP fallback removed earlier.
  // - Buyer email+password endpoints (register/buyer, buyer/migrate-*,
  //   buyer/setup-password) removed 2026-05-15 in favor of WhatsApp OTP.
  // ---------------------------------------------------------------------------
  describe('Removed endpoints return 404', () => {
    it.each([
      ['POST', '/api/v1/auth/otp/request', { phone: '+243999000001' }],
      [
        'POST',
        '/api/v1/auth/otp/verify',
        { phone: '+243999000001', code: '123456' },
      ],
      [
        'POST',
        '/api/v1/auth/register',
        {
          phone: '+243999000001',
          code: '123456',
          firstName: 'X',
          lastName: 'Y',
        },
      ],
      [
        'POST',
        '/api/v1/auth/login',
        { phone: '+243999000001', code: '123456' },
      ],
      ['POST', '/api/v1/auth/login/google', { idToken: 'whatever' }],
      ['POST', '/api/v1/auth/otp/request-email', { phone: '+243999000001' }],
      // Removed 2026-05-15 — buyer auth migrated to WhatsApp OTP.
      [
        'POST',
        '/api/v1/auth/register/buyer',
        {
          email: 'b@x.cd',
          password: 'GoodPass123',
          firstName: 'A',
          lastName: 'B',
        },
      ],
      ['POST', '/api/v1/auth/buyer/migrate-check', { phone: '+243999000001' }],
      [
        'POST',
        '/api/v1/auth/buyer/migrate-link-email',
        { phone: '+243999000001', email: 'b@x.cd' },
      ],
      [
        'POST',
        '/api/v1/auth/buyer/setup-password',
        { token: 'whatever', password: 'GoodPass123' },
      ],
    ])('%s %s returns 404', async (method, url, body) => {
      await request(app.getHttpServer())
        [method.toLowerCase() as 'post'](url)
        .send(body)
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/login/email — sellers and admins. Buyer email login
  // is soft-deprecated (the endpoint still exists for the 3-day-window
  // email+password buyer cohort to keep them from being locked out, but the
  // buyer-web no longer links here).
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/login/email', () => {
    it('rejects invalid credentials with 401', async () => {
      // Constant-time fail when no user found
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login/email')
        .send({ email: 'nobody@example.cd', password: 'GoodPass123' })
        .expect(401);
    });

    it('accepts a valid BUYER login (no more BUYER_EMAIL_AUTH_DISABLED gate)', async () => {
      const passwordHash = await bcrypt.hash('GoodPass123', 10);

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'buyer-id',
        phone: null,
        email: 'buyer@example.cd',
        passwordHash,
        firstName: 'Jean',
        lastName: 'Kabeya',
        role: 'BUYER',
        status: 'ACTIVE',
        authProvider: 'EMAIL_PASSWORD',
        deletedAt: null,
      });
      mockPrismaService.user.update.mockResolvedValue({});
      mockPrismaService.refreshToken.create.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login/email')
        .send({ email: 'buyer@example.cd', password: 'GoodPass123' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('BUYER');
      expect(res.body.data.tokens.accessToken).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/password-reset/request — BUYER is now in the role
  // allowlist (was admin/seller only before).
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/password-reset/request', () => {
    it('returns 200 + creates token for ADMIN with no passwordHash (bootstrap)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'admin-id',
        email: 'contact@teka.cd',
        role: 'ADMIN',
        status: 'ACTIVE',
        authProvider: 'PHONE_OTP',
        passwordHash: null,
        deletedAt: null,
      });
      mockPrismaService.passwordResetToken.create.mockResolvedValue({});

      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'contact@teka.cd' })
        .expect(200);

      expect(mockPrismaService.passwordResetToken.create).toHaveBeenCalledTimes(
        1,
      );
    });

    it('returns 200 + creates token for SELLER', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'seller-id',
        email: 'seller@example.cd',
        role: 'SELLER',
        status: 'ACTIVE',
        authProvider: 'EMAIL_PASSWORD',
        passwordHash: 'hashed',
        deletedAt: null,
      });
      mockPrismaService.passwordResetToken.create.mockResolvedValue({});

      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'seller@example.cd' })
        .expect(200);

      expect(mockPrismaService.passwordResetToken.create).toHaveBeenCalledTimes(
        1,
      );
    });

    it('returns 200 but does NOT create token for BUYER (2026-05-15: buyers have no password)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'buyer-id',
        email: 'buyer@example.cd',
        role: 'BUYER',
        status: 'ACTIVE',
        authProvider: 'PHONE_OTP',
        passwordHash: null,
        deletedAt: null,
      });
      mockPrismaService.passwordResetToken.create.mockResolvedValue({});

      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'buyer@example.cd' })
        .expect(200);

      expect(
        mockPrismaService.passwordResetToken.create,
      ).not.toHaveBeenCalled();
    });

    it('returns 200 (enumeration-safe) for unknown email', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'nobody@example.cd' })
        .expect(200);

      expect(
        mockPrismaService.passwordResetToken.create,
      ).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Buyer WhatsApp OTP — primary buyer auth surface since 2026-05-15.
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/buyer/otp/request', () => {
    it('rejects invalid phone format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/otp/request')
        .send({ phone: 'not-a-phone' })
        .expect(400);
    });

    it('issues OTP for valid phone (mock provider emits DEV code)', async () => {
      mockPrismaService.otpRateLimit.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.otpRateLimit.findFirst.mockResolvedValue(null);
      mockPrismaService.otpRateLimit.create.mockResolvedValue({});
      mockPrismaService.otp.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.otp.create.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/otp/request')
        .send({ phone: '+243999000001' })
        .expect(200);

      expect(res.body.data.expiresInSeconds).toBe(300);
      expect(mockPrismaService.otp.create).toHaveBeenCalled();
    });

    it('returns 429 when rate limit ceiling is exceeded', async () => {
      mockPrismaService.otpRateLimit.deleteMany.mockResolvedValue({ count: 0 });
      // Existing window already at max attempts.
      mockPrismaService.otpRateLimit.findFirst.mockResolvedValue({
        id: 'rate-id',
        phone: '+243999000001',
        count: 3,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/otp/request')
        .send({ phone: '+243999000001' })
        .expect(429);
    });
  });

  describe('POST /api/v1/auth/buyer/otp/verify', () => {
    it('rejects wrong code with 401', async () => {
      mockPrismaService.otp.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+243999000001',
        // sha256('000000') — won't match the submitted '123456'
        code: '91b4d142823f7d20c5f08df69122de43f35f057a988d9619f6d3138485c9a203',
        attempts: 0,
        expiresAt: new Date(Date.now() + 300_000),
        createdAt: new Date(),
      });
      mockPrismaService.otp.update.mockResolvedValue({});

      await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/otp/verify')
        .send({ phone: '+243999000001', code: '123456' })
        .expect(401);
    });

    it('logs in existing buyer on correct code', async () => {
      const buyer = {
        id: 'buyer-1',
        phone: '+243999000001',
        email: null,
        firstName: 'Jean',
        lastName: 'Kabeya',
        role: 'BUYER',
        status: 'ACTIVE',
        authProvider: 'PHONE_OTP',
        phoneVerified: true,
        deletedAt: null,
      };
      mockPrismaService.otp.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+243999000001',
        // sha256('123456')
        code: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
        attempts: 0,
        expiresAt: new Date(Date.now() + 300_000),
        createdAt: new Date(),
      });
      mockPrismaService.otp.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.user.findFirst.mockResolvedValue(buyer);
      mockPrismaService.user.update.mockResolvedValue(buyer);
      mockPrismaService.refreshToken.create.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/otp/verify')
        .send({ phone: '+243999000001', code: '123456' })
        .expect(200);

      expect(res.body.data.user.id).toBe('buyer-1');
      expect(res.body.data.user.role).toBe('BUYER');
      expect(res.body.data.tokens.accessToken).toBeDefined();
      // No user creation on existing-phone path.
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('creates a new BUYER when phone is unknown', async () => {
      mockPrismaService.otp.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+243999000002',
        code: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
        attempts: 0,
        expiresAt: new Date(Date.now() + 300_000),
        createdAt: new Date(),
      });
      mockPrismaService.otp.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      const newUser = {
        id: 'new-buyer',
        phone: '+243999000002',
        role: 'BUYER',
        status: 'ACTIVE',
        authProvider: 'PHONE_OTP',
        phoneVerified: true,
        deletedAt: null,
      };
      mockPrismaService.user.create.mockResolvedValue(newUser);
      mockPrismaService.user.update.mockResolvedValue(newUser);
      mockPrismaService.refreshToken.create.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/otp/verify')
        .send({
          phone: '+243999000002',
          code: '123456',
          firstName: 'Nouvelle',
          lastName: 'Acheteuse',
        })
        .expect(200);

      expect(res.body.data.user.role).toBe('BUYER');
      expect(mockPrismaService.user.create).toHaveBeenCalledTimes(1);
      const createArgs = mockPrismaService.user.create.mock.calls[0][0];
      expect(createArgs.data.phone).toBe('+243999000002');
      expect(createArgs.data.authProvider).toBe('PHONE_OTP');
    });

    it('signs into seller account when phone belongs to a seller (decision #3)', async () => {
      const seller = {
        id: 'seller-1',
        phone: '+243999000003',
        email: 'seller@example.cd',
        role: 'SELLER',
        status: 'ACTIVE',
        authProvider: 'EMAIL_PASSWORD',
        passwordHash: 'hashed',
        deletedAt: null,
      };
      mockPrismaService.otp.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+243999000003',
        code: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
        attempts: 0,
        expiresAt: new Date(Date.now() + 300_000),
        createdAt: new Date(),
      });
      mockPrismaService.otp.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.user.findFirst.mockResolvedValue(seller);
      mockPrismaService.user.update.mockResolvedValue(seller);
      mockPrismaService.refreshToken.create.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/otp/verify')
        .send({ phone: '+243999000003', code: '123456' })
        .expect(200);

      expect(res.body.data.user.role).toBe('SELLER');
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/auth/buyer/otp/resend', () => {
    it('rejects invalid phone format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/otp/resend')
        .send({ phone: 'bad' })
        .expect(400);
    });

    it('returns 429 when resend cooldown not yet elapsed', async () => {
      mockPrismaService.otp.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+243999000001',
        code: 'whatever',
        attempts: 0,
        expiresAt: new Date(Date.now() + 290_000),
        createdAt: new Date(Date.now() - 5_000), // 5s ago, under 30s cooldown
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/otp/resend')
        .send({ phone: '+243999000001' })
        .expect(429);
    });
  });

  // ---------------------------------------------------------------------------
  // Buyer claim flow — for email-only legacy buyers (User.phone IS NULL).
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/buyer/claim/request', () => {
    it('returns neutral 200 for unknown email (enumeration-safe)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/claim/request')
        .send({ email: 'unknown@example.cd' })
        .expect(200);

      expect(mockPrismaService.buyerMigration.upsert).not.toHaveBeenCalled();
    });

    it('upserts BuyerMigration + sends email for an email-only BUYER', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'buyer-1',
        email: 'orphan@example.cd',
        role: 'BUYER',
        phone: null,
        deletedAt: null,
      });
      mockPrismaService.buyerMigration.upsert.mockResolvedValue({});

      await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/claim/request')
        .send({ email: 'orphan@example.cd' })
        .expect(200);

      expect(mockPrismaService.buyerMigration.upsert).toHaveBeenCalledTimes(1);
    });

    it('does nothing for buyer that already has a phone', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'buyer-1',
        email: 'has-phone@example.cd',
        role: 'BUYER',
        phone: '+243999000099',
        deletedAt: null,
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/claim/request')
        .send({ email: 'has-phone@example.cd' })
        .expect(200);

      expect(mockPrismaService.buyerMigration.upsert).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/auth/buyer/claim/verify', () => {
    it('rejects an invalid token with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/claim/verify')
        .send({
          token: 'not-a-jwt',
          phone: '+243999000001',
          code: '123456',
        })
        .expect(400);
    });

    it('rejects invalid OTP code shape with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/claim/verify')
        .send({
          token: 'whatever',
          phone: '+243999000001',
          code: 'abc',
        })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/auth/me — requires authentication
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/auth/me', () => {
    it('returns 401 without a token', () => {
      return request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('returns 401 with an invalid Bearer token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token-here')
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('returns 401 without a token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('rejects refresh without a token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/v1/auth/email/send-verification', () => {
    it('returns 401 without a token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/email/send-verification')
        .expect(401);
    });
  });

  describe('GET /api/v1/auth/email/verify', () => {
    it('rejects an invalid token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/email/verify?token=invalid')
        .expect(400);
    });
  });
});
