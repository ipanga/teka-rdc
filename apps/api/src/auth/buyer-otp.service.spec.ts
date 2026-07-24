import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { DEV_OTP_CODE } from '@teka/shared';
import { BuyerOtpService } from './buyer-otp.service';

function makeConfig(env: Record<string, string> = {}): ConfigService {
  const defaults: Record<string, string> = {
    NODE_ENV: 'test',
    WHATSAPP_PROVIDER: 'mock',
    OTP_EXPIRY_MINUTES: '5',
    ...env,
  };
  return {
    get: (key: string, fallback?: any) => defaults[key] ?? fallback,
  } as unknown as ConfigService;
}

function makePrismaStub() {
  return {
    otp: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    otpRateLimit: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
  } as any;
}

function makeAnalytics() {
  return { capture: jest.fn(), identify: jest.fn() } as any;
}

function makeAuthStub() {
  return {
    generateTokensForUser: jest.fn().mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
    }),
    sanitize: jest.fn((u: any) => u),
  } as any;
}

describe('BuyerOtpService', () => {
  describe('verifyOtpInternal', () => {
    it('returns false when no row matches the phone', async () => {
      const prisma = makePrismaStub();
      prisma.otp.findFirst.mockResolvedValue(null);
      const whatsapp = { sendOtp: jest.fn() } as any;
      const auth = {} as any;

      const svc = new BuyerOtpService(
        prisma,
        whatsapp,
        makeConfig(),
        auth,
        makeAnalytics(),
      );

      const ok = await svc.verifyOtpInternal('+243999000001', '123456');
      expect(ok).toBe(false);
    });

    it('returns true on matching sha256 and deletes the row', async () => {
      const codeHash = createHash('sha256').update('123456').digest('hex');
      const prisma = makePrismaStub();
      prisma.otp.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+243999000001',
        code: codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      });
      const whatsapp = { sendOtp: jest.fn() } as any;
      const auth = {} as any;

      const svc = new BuyerOtpService(
        prisma,
        whatsapp,
        makeConfig(),
        auth,
        makeAnalytics(),
      );

      const ok = await svc.verifyOtpInternal('+243999000001', '123456');
      expect(ok).toBe(true);
      expect(prisma.otp.deleteMany).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
      });
    });

    it('increments attempts on mismatch and does not delete', async () => {
      const codeHash = createHash('sha256').update('000000').digest('hex');
      const prisma = makePrismaStub();
      prisma.otp.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+243999000001',
        code: codeHash,
        attempts: 1,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      });
      const whatsapp = { sendOtp: jest.fn() } as any;
      const auth = {} as any;

      const svc = new BuyerOtpService(
        prisma,
        whatsapp,
        makeConfig(),
        auth,
        makeAnalytics(),
      );

      const ok = await svc.verifyOtpInternal('+243999000001', '123456');
      expect(ok).toBe(false);
      expect(prisma.otp.update).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { attempts: 2 },
      });
      expect(prisma.otp.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes the row at OTP_MAX_ATTEMPTS', async () => {
      const codeHash = createHash('sha256').update('000000').digest('hex');
      const prisma = makePrismaStub();
      prisma.otp.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+243999000001',
        code: codeHash,
        attempts: 4, // 5th attempt triggers deletion
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      });
      const whatsapp = { sendOtp: jest.fn() } as any;
      const auth = {} as any;

      const svc = new BuyerOtpService(
        prisma,
        whatsapp,
        makeConfig(),
        auth,
        makeAnalytics(),
      );

      const ok = await svc.verifyOtpInternal('+243999000001', '123456');
      expect(ok).toBe(false);
      expect(prisma.otp.deleteMany).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
      });
      expect(prisma.otp.update).not.toHaveBeenCalled();
    });
  });

  describe('requestOtp', () => {
    it('emits DEV_OTP_CODE in dev mode with mock provider', async () => {
      const prisma = makePrismaStub();
      const whatsapp = { sendOtp: jest.fn().mockResolvedValue(true) } as any;
      const auth = {} as any;
      const svc = new BuyerOtpService(
        prisma,
        whatsapp,
        makeConfig({ NODE_ENV: 'development', WHATSAPP_PROVIDER: 'mock' }),
        auth,
        makeAnalytics(),
      );

      await svc.requestOtp('+243999000001');

      expect(whatsapp.sendOtp).toHaveBeenCalledWith(
        '+243999000001',
        DEV_OTP_CODE,
      );
      // OTP row stores the sha256 hex, not the plaintext.
      const createCall = prisma.otp.create.mock.calls[0][0];
      expect(createCall.data.code).toHaveLength(64);
    });

    it('throws 429 when the rate-limit window is already at max', async () => {
      const prisma = makePrismaStub();
      prisma.otpRateLimit.findFirst.mockResolvedValue({
        id: 'rl-1',
        phone: '+243999000001',
        count: 3,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const whatsapp = { sendOtp: jest.fn() } as any;
      const auth = {} as any;
      const svc = new BuyerOtpService(
        prisma,
        whatsapp,
        makeConfig(),
        auth,
        makeAnalytics(),
      );

      await expect(svc.requestOtp('+243999000001')).rejects.toMatchObject({
        status: 429,
      });
      expect(prisma.otp.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp analytics', () => {
    const codeHash = createHash('sha256').update('123456').digest('hex');

    function primeValidOtp(prisma: any) {
      prisma.otp.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+243999000001',
        code: codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      });
    }

    it('captures user_registered when a new BUYER is created', async () => {
      const prisma = makePrismaStub();
      primeValidOtp(prisma);
      prisma.user.findFirst.mockResolvedValue(null); // no existing user => new
      prisma.user.create.mockResolvedValue({
        id: 'user-new',
        role: 'BUYER',
        status: 'ACTIVE',
        phone: '+243999000001',
      });
      const analytics = makeAnalytics();
      const svc = new BuyerOtpService(
        prisma,
        { sendOtp: jest.fn() } as any,
        makeConfig(),
        makeAuthStub(),
        analytics,
      );

      await svc.verifyOtp('+243999000001', '123456');

      expect(analytics.capture).toHaveBeenCalledWith(
        'user-new',
        'user_registered',
        {
          role: 'BUYER',
          method: 'whatsapp_otp',
        },
      );
    });

    it('captures user_login when the phone already has an account', async () => {
      const prisma = makePrismaStub();
      primeValidOtp(prisma);
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-existing',
        role: 'BUYER',
        status: 'ACTIVE',
        phone: '+243999000001',
      });
      const analytics = makeAnalytics();
      const svc = new BuyerOtpService(
        prisma,
        { sendOtp: jest.fn() } as any,
        makeConfig(),
        makeAuthStub(),
        analytics,
      );

      await svc.verifyOtp('+243999000001', '123456');

      expect(analytics.capture).toHaveBeenCalledWith(
        'user-existing',
        'user_login',
        {
          role: 'BUYER',
          method: 'whatsapp_otp',
        },
      );
    });
  });

  describe('app-review login (allowlisted bypass)', () => {
    const REVIEW_PHONE = '+243900000000';
    const reviewConfig = (over: Record<string, string> = {}) =>
      makeConfig({
        APP_REVIEW_LOGIN_ENABLED: 'true',
        APP_REVIEW_BUYER_PHONE_E164: REVIEW_PHONE,
        APP_REVIEW_BUYER_OTP: '123456',
        ...over,
      });

    function reviewService(config: ConfigService) {
      const prisma = makePrismaStub();
      // No real OTP row exists — the only way verify can pass is the bypass.
      prisma.otp.findFirst.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue({
        id: 'review-buyer',
        role: 'BUYER',
        status: 'ACTIVE',
        phone: REVIEW_PHONE,
      });
      const svc = new BuyerOtpService(
        prisma,
        { sendOtp: jest.fn() } as any,
        config,
        makeAuthStub(),
        makeAnalytics(),
      );
      return { svc, prisma };
    }

    it('signs in the allowlisted phone with the fixed OTP (no real OTP row)', async () => {
      const { svc } = reviewService(reviewConfig());
      const res = await svc.verifyOtp(REVIEW_PHONE, '123456');
      expect(res.user.id).toBe('review-buyer');
      expect(res.tokens.accessToken).toBeTruthy();
    });

    it('rejects the fixed OTP for any other phone', async () => {
      const { svc } = reviewService(reviewConfig());
      await expect(
        svc.verifyOtp('+243999999999', '123456'),
      ).rejects.toThrow();
    });

    it('rejects a wrong code for the allowlisted phone', async () => {
      const { svc } = reviewService(reviewConfig());
      await expect(svc.verifyOtp(REVIEW_PHONE, '000000')).rejects.toThrow();
    });

    it('is inert when the feature is disabled', async () => {
      const { svc } = reviewService(reviewConfig({ APP_REVIEW_LOGIN_ENABLED: 'false' }));
      await expect(svc.verifyOtp(REVIEW_PHONE, '123456')).rejects.toThrow();
    });

    it('never matches on empty config', async () => {
      const { svc } = reviewService(
        reviewConfig({ APP_REVIEW_BUYER_PHONE_E164: '', APP_REVIEW_BUYER_OTP: '' }),
      );
      await expect(svc.verifyOtp('', '')).rejects.toThrow();
    });
  });
});
