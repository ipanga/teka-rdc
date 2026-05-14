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
  // Phone-OTP auth was removed in the 2026-05-12 buyer email refactor; Google
  // login was removed earlier (April 2026); email-OTP fallback also removed.
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
      ['POST', '/api/v1/auth/login', { phone: '+243999000001', code: '123456' }],
      ['POST', '/api/v1/auth/login/google', { idToken: 'whatever' }],
      ['POST', '/api/v1/auth/otp/request-email', { phone: '+243999000001' }],
    ])('%s %s returns 404', async (method, url, body) => {
      await request(app.getHttpServer())
        [method.toLowerCase() as 'post'](url)
        .send(body)
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/register/buyer — email + password buyer registration
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/register/buyer', () => {
    it('rejects empty body', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register/buyer')
        .send({})
        .expect(400);
    });

    it('rejects invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register/buyer')
        .send({
          email: 'not-an-email',
          password: 'GoodPass123',
          firstName: 'Jean',
          lastName: 'Kabeya',
        })
        .expect(400);
    });

    it('rejects weak password (no digit)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register/buyer')
        .send({
          email: 'buyer@example.cd',
          password: 'OnlyLetters',
          firstName: 'Jean',
          lastName: 'Kabeya',
        })
        .expect(400);
    });

    it('rejects when email already taken', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing-id',
        email: 'taken@example.cd',
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/register/buyer')
        .send({
          email: 'taken@example.cd',
          password: 'GoodPass123',
          firstName: 'Jean',
          lastName: 'Kabeya',
        })
        .expect(409);
    });

    it('creates a buyer with role=BUYER and authProvider=EMAIL_PASSWORD', async () => {
      const mockUser = {
        id: '10000000-0000-0000-0000-000000000099',
        phone: null,
        email: 'newbuyer@example.cd',
        firstName: 'Jean',
        lastName: 'Kabeya',
        role: 'BUYER',
        status: 'ACTIVE',
        authProvider: 'EMAIL_PASSWORD',
        emailVerified: false,
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // First findUnique = email-uniqueness check (returns null)
      // Subsequent calls for sendEmailVerification etc. also return the user
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValue(mockUser);
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockPrismaService.refreshToken.create.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register/buyer')
        .send({
          email: 'newbuyer@example.cd',
          password: 'GoodPass123',
          firstName: 'Jean',
          lastName: 'Kabeya',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('BUYER');
      expect(res.body.data.user.authProvider).toBe('EMAIL_PASSWORD');
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();
      expect(mockPrismaService.user.create).toHaveBeenCalledTimes(1);
      const createArgs = mockPrismaService.user.create.mock.calls[0][0];
      expect(createArgs.data.role).toBe('BUYER');
      expect(createArgs.data.phone).toBeNull();
      expect(createArgs.data.authProvider).toBe('EMAIL_PASSWORD');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/login/email — now accepts BUYER (previously rejected)
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

      expect(
        mockPrismaService.passwordResetToken.create,
      ).toHaveBeenCalledTimes(1);
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

      expect(
        mockPrismaService.passwordResetToken.create,
      ).toHaveBeenCalledTimes(1);
    });

    it('returns 200 + creates token for BUYER (post-refactor — was excluded before)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'buyer-id',
        email: 'buyer@example.cd',
        role: 'BUYER',
        status: 'ACTIVE',
        authProvider: 'EMAIL_PASSWORD',
        passwordHash: 'hashed',
        deletedAt: null,
      });
      mockPrismaService.passwordResetToken.create.mockResolvedValue({});

      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'buyer@example.cd' })
        .expect(200);

      expect(
        mockPrismaService.passwordResetToken.create,
      ).toHaveBeenCalledTimes(1);
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
  // Buyer migration (PHONE_OTP legacy → email+password). Three-step flow:
  // migrate-check → migrate-link-email → setup-password.
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/buyer/migrate-check', () => {
    it('rejects invalid phone format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/migrate-check')
        .send({ phone: 'not-a-phone' })
        .expect(400);
    });

    it('returns "unknown" for non-existent phone (enumeration-safe)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/migrate-check')
        .send({ phone: '+243999000001' })
        .expect(200);

      expect(res.body.data.migration).toBe('unknown');
    });

    it('returns "needs_email_setup" for legacy PHONE_OTP buyer', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'buyer-id',
        phone: '+243999000001',
        email: null,
        role: 'BUYER',
        authProvider: 'PHONE_OTP',
        passwordHash: null,
        deletedAt: null,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/migrate-check')
        .send({ phone: '+243999000001' })
        .expect(200);

      expect(res.body.data.migration).toBe('needs_email_setup');
    });

    it('returns "already_migrated" for buyer with EMAIL_PASSWORD + hash', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'buyer-id',
        phone: '+243999000001',
        email: 'buyer@example.cd',
        role: 'BUYER',
        authProvider: 'EMAIL_PASSWORD',
        passwordHash: 'hashed',
        deletedAt: null,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/migrate-check')
        .send({ phone: '+243999000001' })
        .expect(200);

      expect(res.body.data.migration).toBe('already_migrated');
    });
  });

  describe('POST /api/v1/auth/buyer/migrate-link-email', () => {
    it('rejects invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/migrate-link-email')
        .send({ phone: '+243999000001', email: 'not-an-email' })
        .expect(400);
    });

    it('returns neutral 200 for unknown phone (enumeration-safe)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/migrate-link-email')
        .send({
          phone: '+243999000001',
          email: 'someone@example.cd',
        })
        .expect(200);

      expect(res.body.data.migration).toBe('email_setup_sent');
      expect(mockPrismaService.buyerMigration.upsert).not.toHaveBeenCalled();
    });

    it('stashes tempEmail in BuyerMigration and sends setup link', async () => {
      mockPrismaService.user.findUnique
        // 1st: lookup by phone → existing buyer
        .mockResolvedValueOnce({
          id: 'buyer-id',
          phone: '+243999000001',
          email: null,
          role: 'BUYER',
          authProvider: 'PHONE_OTP',
          passwordHash: null,
          deletedAt: null,
        })
        // 2nd: email-uniqueness check → no conflict
        .mockResolvedValueOnce(null);
      mockPrismaService.buyerMigration.upsert.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/migrate-link-email')
        .send({
          phone: '+243999000001',
          email: 'newbuyer@example.cd',
        })
        .expect(200);

      expect(res.body.data.migration).toBe('email_setup_sent');
      expect(mockPrismaService.buyerMigration.upsert).toHaveBeenCalledTimes(1);
      const upsertArgs =
        mockPrismaService.buyerMigration.upsert.mock.calls[0][0];
      expect(upsertArgs.create.tempEmail).toBe('newbuyer@example.cd');
    });

    it('silently refuses when chosen email is owned by another user', async () => {
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({
          id: 'buyer-id',
          phone: '+243999000001',
          role: 'BUYER',
          authProvider: 'PHONE_OTP',
          passwordHash: null,
          deletedAt: null,
        })
        .mockResolvedValueOnce({
          id: 'OTHER-USER',
          email: 'taken@example.cd',
          deletedAt: null,
        });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/migrate-link-email')
        .send({
          phone: '+243999000001',
          email: 'taken@example.cd',
        })
        .expect(200);

      expect(res.body.data.migration).toBe('email_setup_sent');
      expect(mockPrismaService.buyerMigration.upsert).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/auth/buyer/setup-password', () => {
    it('rejects invalid token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/setup-password')
        .send({ token: 'not-a-jwt', password: 'GoodPass123' })
        .expect(400);
    });

    it('rejects weak password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/buyer/setup-password')
        .send({ token: 'whatever', password: 'short' })
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
