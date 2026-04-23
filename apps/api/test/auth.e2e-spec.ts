import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMocks,
  mockPrismaService,
} from './test-utils';

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

  /**
   * Helper: mock OTP verification to succeed.
   * Since tests run with NODE_ENV=test (jest default), the dev bypass (code '123456')
   * won't work. Instead, we mock the Prisma OTP lookup to return a valid OTP record.
   */
  function mockOtpVerifySuccess(phone: string, code: string = '123456') {
    mockPrismaService.otp.findFirst.mockResolvedValue({
      id: 'otp-test-id',
      phone,
      code,
      attempts: 0,
      expiresAt: new Date(Date.now() + 300000), // 5 min in the future
      createdAt: new Date(),
    });
    mockPrismaService.otp.delete.mockResolvedValue({});
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/otp/request
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/otp/request', () => {
    it('should accept a valid +243 phone number and return 200', async () => {
      // No rate limit entries
      mockPrismaService.otpRateLimit.count.mockResolvedValue(0);
      // No existing user
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      // OTP operations
      mockPrismaService.otp.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.otp.create.mockResolvedValue({});
      mockPrismaService.otpRateLimit.create.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: '+243999000001' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.expiresIn).toBeDefined();
    });

    it('should reject a phone number without +243 prefix', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: '+1234567890' })
        .expect(400)
        .expect((res) => {
          expect(res.body.success).toBe(false);
        });
    });

    it('should reject a phone number that is too short', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: '+24399900' })
        .expect(400);
    });

    it('should reject an empty body', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({})
        .expect(400);
    });

    it('should reject a non-numeric phone value', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: 'not-a-phone' })
        .expect(400);
    });

    it('should reject extra/unknown fields (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: '+243999000001', hack: true })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/otp/verify
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/otp/verify', () => {
    it('should reject without required fields', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({})
        .expect(400);
    });

    it('should reject a code shorter than 6 digits', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '+243999000001', code: '123' })
        .expect(400);
    });

    it('should reject a non-numeric code', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '+243999000001', code: 'abcdef' })
        .expect(400);
    });

    it('should accept valid phone + 6-digit code', async () => {
      mockOtpVerifySuccess('+243999000001');
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '+243999000001', code: '123456' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.verified).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/register
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/register', () => {
    it('should reject registration without required fields', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({})
        .expect(400)
        .expect((res) => {
          expect(res.body.success).toBe(false);
        });
    });

    it('should reject registration with invalid phone format', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          phone: 'invalid-phone',
          code: '123456',
          firstName: 'Jean',
          lastName: 'Kabeya',
        })
        .expect(400);
    });

    it('should reject registration with missing firstName', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          phone: '+243999000001',
          code: '123456',
          lastName: 'Kabeya',
        })
        .expect(400);
    });

    it('should reject registration with firstName too short', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          phone: '+243999000001',
          code: '123456',
          firstName: 'J',
          lastName: 'Kabeya',
        })
        .expect(400);
    });

    it('should reject invalid locale', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          phone: '+243999000001',
          code: '123456',
          firstName: 'Jean',
          lastName: 'Kabeya',
          locale: 'de',
        })
        .expect(400);
    });

    it('should register a new user with valid data', async () => {
      const mockUser = {
        id: '10000000-0000-0000-0000-000000000099',
        phone: '+243999000099',
        firstName: 'Jean',
        lastName: 'Kabeya',
        role: 'BUYER',
        status: 'ACTIVE',
        locale: 'fr',
        phoneVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock OTP verification
      mockOtpVerifySuccess('+243999000099');
      // No existing user (first call for OTP check, second for registration check)
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockPrismaService.refreshToken.create.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          phone: '+243999000099',
          code: '123456',
          firstName: 'Jean',
          lastName: 'Kabeya',
          locale: 'fr',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.tokens).toBeDefined();
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/login
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/login', () => {
    it('should reject login without credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);
    });

    it('should reject login with missing code', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ phone: '+243999000001' })
        .expect(400);
    });

    it('should reject login with invalid phone', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ phone: 'bad', code: '123456' })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/auth/me — requires authentication
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/auth/me', () => {
    it('should return 401 without a token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });

    it('should return 401 with an invalid Bearer token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token-here')
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/logout — requires authentication
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/logout', () => {
    it('should return 401 without a token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/refresh — public endpoint
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/refresh', () => {
    it('should reject refresh without a token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({});

      // Should return an error (500 from throw new Error or similar)
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/email/send-verification — requires auth
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/email/send-verification', () => {
    it('should return 401 without a token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/email/send-verification')
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/auth/email/verify — public endpoint
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/auth/email/verify', () => {
    it('should reject with an invalid token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/email/verify?token=invalid')
        .expect(400);
    });
  });
});
