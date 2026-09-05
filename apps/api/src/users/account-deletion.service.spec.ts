import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AccountDeletionService } from './account-deletion.service';

// verifyPassword is a free function — mock it so we control password re-auth.
jest.mock('../auth/utils/password.util', () => ({
  verifyPassword: jest.fn(),
}));
import { verifyPassword } from '../auth/utils/password.util';

describe('AccountDeletionService', () => {
  let service: AccountDeletionService;
  let prisma: any;
  let authService: { logout: jest.Mock };
  let buyerOtp: { verifyOtpInternal: jest.Mock };
  let deviceTokens: { deactivateAll: jest.Mock };
  let email: { sendAccountDeletionScheduled: jest.Mock };

  const baseSeller = {
    id: 'u-seller',
    role: 'SELLER',
    phone: '+243990000002',
    email: 'seller@example.cd',
    passwordHash: 'hash',
    deletionRequestedAt: null,
    deletionScheduledAt: null,
    sellerProfile: { id: 'sp-1' },
  };

  const baseBuyer = {
    id: 'u-buyer',
    role: 'BUYER',
    phone: '+243990000001',
    email: 'buyer@example.cd',
    passwordHash: null,
    deletionRequestedAt: null,
    deletionScheduledAt: null,
    sellerProfile: null,
  };

  beforeEach(() => {
    (verifyPassword as jest.Mock).mockReset();
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      order: { findFirst: jest.fn().mockResolvedValue(null) },
      returnRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      sellerEarning: { findFirst: jest.fn().mockResolvedValue(null) },
      payout: { findFirst: jest.fn().mockResolvedValue(null) },
      sellerProfile: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest
          .fn()
          .mockResolvedValue({ idDocumentCloudinaryId: null }),
      },
      deviceToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    authService = { logout: jest.fn().mockResolvedValue(undefined) };
    buyerOtp = { verifyOtpInternal: jest.fn() };
    deviceTokens = { deactivateAll: jest.fn().mockResolvedValue({ removed: 0 }) };
    email = { sendAccountDeletionScheduled: jest.fn().mockResolvedValue(true) };

    service = new AccountDeletionService(
      prisma,
      authService as never,
      buyerOtp as never,
      deviceTokens as never,
      email as never,
      { deletePrivateAsset: jest.fn().mockResolvedValue(true) } as never,
      {
        purgeAllForSeller: jest
          .fn()
          .mockResolvedValue({ purged: 0, failed: 0 }),
      } as never,
    );
  });

  const dto = (over: Record<string, unknown> = {}) => ({
    confirmPhrase: 'SUPPRIMER',
    ...over,
  });

  it('rejects staff/admin accounts', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseBuyer, role: 'ADMIN' });
    await expect(
      service.requestDeletion('u-buyer', dto({ password: 'x' }) as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('buyer: rejects an invalid OTP', async () => {
    prisma.user.findUnique.mockResolvedValue(baseBuyer);
    buyerOtp.verifyOtpInternal.mockResolvedValue(false);
    await expect(
      service.requestDeletion('u-buyer', dto({ otpCode: '000000' }) as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('buyer: schedules deletion, revokes sessions + tokens on valid OTP', async () => {
    prisma.user.findUnique.mockResolvedValue(baseBuyer);
    buyerOtp.verifyOtpInternal.mockResolvedValue(true);

    const res = await service.requestDeletion(
      'u-buyer',
      dto({ otpCode: '123456' }) as never,
    );

    expect(res.pending).toBe(true);
    expect(res.scheduledAt).toBeInstanceOf(Date);
    // ~30 days out.
    const days =
      (res.scheduledAt!.getTime() - res.requestedAt!.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deletionRequestedAt: expect.any(Date),
          deletionScheduledAt: expect.any(Date),
        }),
      }),
    );
    expect(authService.logout).toHaveBeenCalledWith('u-buyer');
    expect(deviceTokens.deactivateAll).toHaveBeenCalledWith('u-buyer');
    expect(email.sendAccountDeletionScheduled).toHaveBeenCalled();
  });

  it('seller: rejects a wrong password', async () => {
    prisma.user.findUnique.mockResolvedValue(baseSeller);
    (verifyPassword as jest.Mock).mockResolvedValue(false);
    await expect(
      service.requestDeletion('u-seller', dto({ password: 'nope' }) as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('blocks deletion while an active order exists', async () => {
    prisma.user.findUnique.mockResolvedValue(baseSeller);
    (verifyPassword as jest.Mock).mockResolvedValue(true);
    prisma.order.findFirst.mockResolvedValue({ id: 'o-1' });
    await expect(
      service.requestDeletion('u-seller', dto({ password: 'ok' }) as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('blocks seller deletion while an unpaid earning exists', async () => {
    prisma.user.findUnique.mockResolvedValue(baseSeller);
    (verifyPassword as jest.Mock).mockResolvedValue(true);
    prisma.sellerEarning.findFirst.mockResolvedValue({ id: 'e-1' });
    await expect(
      service.requestDeletion('u-seller', dto({ password: 'ok' }) as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is idempotent when a deletion is already pending', async () => {
    const requestedAt = new Date('2026-07-01');
    prisma.user.findUnique.mockResolvedValue({
      ...baseBuyer,
      deletionRequestedAt: requestedAt,
      deletionScheduledAt: new Date('2026-07-31'),
    });
    const res = await service.requestDeletion(
      'u-buyer',
      dto({ otpCode: '1' }) as never,
    );
    expect(res.pending).toBe(true);
    expect(buyerOtp.verifyOtpInternal).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('purge anonymizes due accounts: stamps deletedAt + scrubs PII', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-buyer', sellerProfile: null },
    ]);

    await service.purgePending();

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-buyer' },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          email: null,
          phone: null,
          passwordHash: null,
          deletionRequestedAt: null,
          deletionScheduledAt: null,
        }),
      }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    expect(prisma.deviceToken.updateMany).toHaveBeenCalled();
  });

  it('purge skips an account that regained a blocker', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-seller', sellerProfile: { id: 'sp-1' } },
    ]);
    prisma.order.findFirst.mockResolvedValue({ id: 'o-late' });

    await service.purgePending();

    // No anonymize update (only the findMany happened).
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
