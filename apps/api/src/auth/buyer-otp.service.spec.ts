import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { BuyerOtpService } from './buyer-otp.service';
import { DEV_OTP_CODE } from '@teka/shared';

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

describe('BuyerOtpService', () => {
  describe('verifyOtpInternal', () => {
    it('returns false when no row matches the phone', async () => {
      const prisma = makePrismaStub();
      prisma.otp.findFirst.mockResolvedValue(null);
      const whatsapp = { sendOtp: jest.fn() } as any;
      const auth = {} as any;

      const svc = new BuyerOtpService(prisma, whatsapp, makeConfig(), auth);

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

      const svc = new BuyerOtpService(prisma, whatsapp, makeConfig(), auth);

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

      const svc = new BuyerOtpService(prisma, whatsapp, makeConfig(), auth);

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

      const svc = new BuyerOtpService(prisma, whatsapp, makeConfig(), auth);

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
      const svc = new BuyerOtpService(prisma, whatsapp, makeConfig(), auth);

      await expect(svc.requestOtp('+243999000001')).rejects.toMatchObject({
        status: 429,
      });
      expect(prisma.otp.create).not.toHaveBeenCalled();
    });
  });
});
