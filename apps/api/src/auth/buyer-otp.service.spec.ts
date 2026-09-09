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

function makeRateLimit() {
  return {
    hit: jest.fn().mockResolvedValue({ allowed: true, count: 1, retryAfterSeconds: 0 }),
    enforce: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    status: jest.fn().mockResolvedValue({ allowed: true, count: 0, retryAfterSeconds: 0 }),
    assertNotBlocked: jest.fn().mockResolvedValue(undefined),
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
        makeRateLimit(),
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
        makeRateLimit(),
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
        makeRateLimit(),
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
        makeRateLimit(),
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
        makeRateLimit(),
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

    it('throws 429 (with Retry-After) when the per-phone issuance budget is spent (D8)', async () => {
      const prisma = makePrismaStub();
      const rateLimit = makeRateLimit();
      rateLimit.hit.mockResolvedValue({ allowed: false, count: 4, retryAfterSeconds: 321 });
      const whatsapp = { sendOtp: jest.fn() } as any;
      const auth = {} as any;
      const svc = new BuyerOtpService(
        prisma,
        whatsapp,
        makeConfig(),
        auth,
        makeAnalytics(),
        rateLimit,
      );

      await expect(svc.requestOtp('+243999000001')).rejects.toMatchObject({
        status: 429,
        retryAfterSeconds: 321,
      });
      expect(rateLimit.hit).toHaveBeenCalledWith('otpRequest', '+243999000001');
      expect(prisma.otp.create).not.toHaveBeenCalled();
      expect(whatsapp.sendOtp).not.toHaveBeenCalled();
      // The legacy OtpRateLimit table is no longer consulted.
      expect(prisma.otpRateLimit.findFirst).not.toHaveBeenCalled();
    });

    it('D8: /request honours the 30 s cooldown of an active OTP, like /resend', async () => {
      const prisma = makePrismaStub();
      prisma.otp.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+243999000001',
        code: 'x'.repeat(64),
        attempts: 0,
        expiresAt: new Date(Date.now() + 300_000),
        createdAt: new Date(Date.now() - 5_000),
      });
      const rateLimit = makeRateLimit();
      const whatsapp = { sendOtp: jest.fn() } as any;
      const svc = new BuyerOtpService(
        prisma,
        whatsapp,
        makeConfig(),
        {} as any,
        makeAnalytics(),
        rateLimit,
      );

      await expect(svc.requestOtp('+243999000001')).rejects.toMatchObject({
        status: 429,
      });
      // Cooldown is checked first: no issuance budget consumed, nothing sent.
      expect(rateLimit.hit).not.toHaveBeenCalled();
      expect(whatsapp.sendOtp).not.toHaveBeenCalled();
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
        makeRateLimit(),
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
        makeRateLimit(),
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

  describe('app-review bypass — operational guards (S10)', () => {
    it('logs an error on construction when the bypass is enabled in production', () => {
      const errorSpy = jest
        .spyOn(require('@nestjs/common').Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      new BuyerOtpService(
        makePrismaStub(),
        { sendOtp: jest.fn() } as any,
        makeConfig({ NODE_ENV: 'production', APP_REVIEW_LOGIN_ENABLED: 'true' }),
        makeAuthStub(),
        makeAnalytics(),
        makeRateLimit(),
      );
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('PRODUCTION'));
      errorSpy.mockClear();
      new BuyerOtpService(
        makePrismaStub(),
        { sendOtp: jest.fn() } as any,
        makeConfig({ NODE_ENV: 'production', APP_REVIEW_LOGIN_ENABLED: 'false' }),
        makeAuthStub(),
        makeAnalytics(),
        makeRateLimit(),
      );
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('rejects a code of a different length and a same-length wrong code alike', async () => {
      const prisma = makePrismaStub();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.otp.findFirst.mockResolvedValue(null);
      const svc = new BuyerOtpService(
        prisma,
        { sendOtp: jest.fn() } as any,
        makeConfig({
          APP_REVIEW_LOGIN_ENABLED: 'true',
          APP_REVIEW_BUYER_PHONE_E164: '+243999000777',
          APP_REVIEW_BUYER_OTP: '654321',
        }),
        makeAuthStub(),
        makeAnalytics(),
        makeRateLimit(),
      );
      await expect(svc.verifyOtp('+243999000777', '65432')).rejects.toMatchObject({ status: 401 });
      await expect(svc.verifyOtp('+243999000777', '654320')).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('D1 — WhatsApp OTP authenticates BUYER accounts only', () => {
    const codeHash = createHash('sha256').update('123456').digest('hex');
    const seller = {
      id: 'seller-1',
      phone: '+243999000003',
      role: 'SELLER',
      status: 'ACTIVE',
      authProvider: 'EMAIL_PASSWORD',
      deletedAt: null,
    };
    const admin = { ...seller, id: 'admin-1', phone: '+243999000004', role: 'ADMIN' };
    const buyer = {
      id: 'buyer-1',
      phone: '+243999000005',
      role: 'BUYER',
      status: 'ACTIVE',
      authProvider: 'PHONE_OTP',
      deletedAt: null,
    };

    function primeValidOtp(prisma: any, phone: string) {
      prisma.otp.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone,
        code: codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 300_000),
        createdAt: new Date(),
      });
      prisma.otp.deleteMany.mockResolvedValue({ count: 1 });
    }

    function build(prisma: any, whatsapp?: any, env: Record<string, string> = {}) {
      const auth = makeAuthStub();
      const rateLimit = makeRateLimit();
      const svc = new BuyerOtpService(
        prisma,
        whatsapp ?? ({ sendOtp: jest.fn().mockResolvedValue(true) } as any),
        makeConfig(env),
        auth,
        makeAnalytics(),
        rateLimit,
      );
      return { svc, auth, rateLimit };
    }

    it.each([
      ['SELLER', seller],
      ['ADMIN', admin],
    ])('requestOtp for a %s phone sends nothing and stores no OTP row, with the buyer-shaped response', async (_role, account) => {
      const prisma = makePrismaStub();
      prisma.user.findFirst.mockResolvedValue(account);
      const whatsapp = { sendOtp: jest.fn().mockResolvedValue(true) } as any;
      const { svc, rateLimit } = build(prisma, whatsapp);

      const res = await svc.requestOtp(account.phone);

      expect(res).toEqual({ expiresInSeconds: 300, cooldownSeconds: 30 });
      expect(whatsapp.sendOtp).not.toHaveBeenCalled();
      expect(prisma.otp.create).not.toHaveBeenCalled();
      // The issuance budget is still consumed, exactly like a buyer request.
      expect(rateLimit.hit).toHaveBeenCalledWith('otpRequest', account.phone);
    });

    it('resendOtp for a SELLER phone sends nothing either', async () => {
      const prisma = makePrismaStub();
      prisma.user.findFirst.mockResolvedValue(seller);
      const whatsapp = { sendOtp: jest.fn().mockResolvedValue(true) } as any;
      const { svc } = build(prisma, whatsapp);

      await svc.resendOtp(seller.phone);

      expect(whatsapp.sendOtp).not.toHaveBeenCalled();
      expect(prisma.otp.create).not.toHaveBeenCalled();
    });

    it('requestOtp for an unknown phone and for a BUYER phone both send an OTP', async () => {
      for (const account of [null, buyer]) {
        const prisma = makePrismaStub();
        prisma.user.findFirst.mockResolvedValue(account);
        const whatsapp = { sendOtp: jest.fn().mockResolvedValue(true) } as any;
        const { svc } = build(prisma, whatsapp);
        const res = await svc.requestOtp('+243999000005');
        expect(res).toEqual({ expiresInSeconds: 300, cooldownSeconds: 30 });
        expect(whatsapp.sendOtp).toHaveBeenCalledTimes(1);
        expect(prisma.otp.create).toHaveBeenCalledTimes(1);
      }
    });

    it.each([
      ['SELLER', seller],
      ['ADMIN', admin],
    ])('verifyOtp with a valid code for a %s phone is refused with the generic invalid-code 401 and issues no token', async (_role, account) => {
      const prisma = makePrismaStub();
      primeValidOtp(prisma, account.phone);
      prisma.user.findFirst.mockResolvedValue(account);
      const { svc, auth } = build(prisma);

      await expect(svc.verifyOtp(account.phone, '123456')).rejects.toMatchObject({
        status: 401,
        message: 'Code OTP invalide ou expiré',
      });
      expect(auth.generateTokensForUser).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('the refusal is indistinguishable from a wrong code (same status + message)', async () => {
      const prisma = makePrismaStub();
      primeValidOtp(prisma, buyer.phone);
      prisma.user.findFirst.mockResolvedValue(buyer);
      prisma.otp.update.mockResolvedValue({});
      const { svc } = build(prisma);
      let wrongCode: any;
      await svc.verifyOtp(buyer.phone, '000000').catch((e) => (wrongCode = e));

      const prisma2 = makePrismaStub();
      primeValidOtp(prisma2, seller.phone);
      prisma2.user.findFirst.mockResolvedValue(seller);
      const { svc: svc2 } = build(prisma2);
      let refused: any;
      await svc2.verifyOtp(seller.phone, '123456').catch((e) => (refused = e));

      expect(refused.status).toBe(wrongCode.status);
      expect(refused.message).toBe(wrongCode.message);
    });

    it('the app-review bypass cannot open a SELLER account either', async () => {
      const prisma = makePrismaStub();
      prisma.user.findFirst.mockResolvedValue(seller);
      const { svc, auth } = build(prisma, undefined, {
        APP_REVIEW_LOGIN_ENABLED: 'true',
        APP_REVIEW_BUYER_PHONE_E164: seller.phone,
        APP_REVIEW_BUYER_OTP: '111111',
      });

      await expect(svc.verifyOtp(seller.phone, '111111')).rejects.toMatchObject({
        status: 401,
      });
      expect(auth.generateTokensForUser).not.toHaveBeenCalled();
    });

    it('a BUYER phone with a valid code gets tokens minted with the stored BUYER role', async () => {
      const prisma = makePrismaStub();
      primeValidOtp(prisma, buyer.phone);
      prisma.user.findFirst.mockResolvedValue(buyer);
      prisma.user.update.mockResolvedValue(buyer);
      const { svc, auth } = build(prisma);

      const res = await svc.verifyOtp(buyer.phone, '123456');

      expect(auth.generateTokensForUser).toHaveBeenCalledWith(
        'buyer-1',
        'BUYER',
        buyer.phone,
        undefined,
      );
      expect(res.user.role).toBe('BUYER');
      expect(prisma.user.create).not.toHaveBeenCalled();
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
        makeRateLimit(),
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

  describe('D8 — per-phone verification budget', () => {
    const codeHash = createHash('sha256').update('123456').digest('hex');
    function primed() {
      const prisma = makePrismaStub();
      prisma.otp.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: '+243999000001',
        code: codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 300_000),
        createdAt: new Date(),
      });
      prisma.otp.deleteMany.mockResolvedValue({ count: 1 });
      return prisma;
    }
    function build(prisma: any, rateLimit: any) {
      return new BuyerOtpService(
        prisma,
        { sendOtp: jest.fn() } as any,
        makeConfig(),
        makeAuthStub(),
        makeAnalytics(),
        rateLimit,
      );
    }

    it('verifyOtpInternal counts one otpVerify hit and refuses with 429 once spent — before touching the Otp row', async () => {
      const prisma = primed();
      const rateLimit = makeRateLimit();
      rateLimit.hit.mockResolvedValue({ allowed: false, count: 11, retryAfterSeconds: 600 });
      const svc = build(prisma, rateLimit);

      await expect(svc.verifyOtpInternal('+243999000001', '123456')).rejects.toMatchObject({
        status: 429,
        retryAfterSeconds: 600,
      });
      expect(rateLimit.hit).toHaveBeenCalledWith('otpVerify', '+243999000001');
      expect(prisma.otp.findFirst).not.toHaveBeenCalled();
      expect(prisma.otp.deleteMany).not.toHaveBeenCalled();
    });

    it('verifyOtp counts exactly once per call and clears the budget on success', async () => {
      const prisma = primed();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u-new', role: 'BUYER', phone: '+243999000001' });
      const rateLimit = makeRateLimit();
      const svc = build(prisma, rateLimit);

      await svc.verifyOtp('+243999000001', '123456');

      expect(rateLimit.hit).toHaveBeenCalledTimes(1);
      expect(rateLimit.hit).toHaveBeenCalledWith('otpVerify', '+243999000001');
      expect(rateLimit.clear).toHaveBeenCalledWith('otpVerify', '+243999000001');
    });

    it('a wrong code keeps the budget (no clear) and still bumps the per-code attempt counter', async () => {
      const prisma = primed();
      const rateLimit = makeRateLimit();
      const svc = build(prisma, rateLimit);

      const ok = await svc.verifyOtpInternal('+243999000001', '000000');

      expect(ok).toBe(false);
      expect(rateLimit.clear).not.toHaveBeenCalled();
      expect(prisma.otp.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { attempts: 1 } }),
      );
    });

    it('the budget is counted before the app-review bypass is consulted', async () => {
      const prisma = makePrismaStub();
      const rateLimit = makeRateLimit();
      rateLimit.hit.mockResolvedValue({ allowed: false, count: 11, retryAfterSeconds: 60 });
      const svc = new BuyerOtpService(
        prisma,
        { sendOtp: jest.fn() } as any,
        makeConfig({
          APP_REVIEW_LOGIN_ENABLED: 'true',
          APP_REVIEW_BUYER_PHONE_E164: '+243999000001',
          APP_REVIEW_BUYER_OTP: '424242',
        }),
        makeAuthStub(),
        makeAnalytics(),
        rateLimit,
      );

      await expect(svc.verifyOtp('+243999000001', '424242')).rejects.toMatchObject({ status: 429 });
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });
  });
});
