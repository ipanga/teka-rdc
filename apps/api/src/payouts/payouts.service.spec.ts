import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayoutStatus } from '@prisma/client';
import { PayoutsService } from './payouts.service';

// First unit coverage for the payout state machine (Payouts Operationalization
// Phase A / A1). Hand-rolled Prisma mock per delegate, mirroring the project's
// other *.service.spec.ts files. $transaction runs its callback against the
// same mock so the reject-restore path is exercised end to end.
function makeService(payout: Record<string, unknown> | null) {
  const prisma = {
    payout: {
      findUnique: jest.fn().mockResolvedValue(payout),
      update: jest
        .fn()
        .mockImplementation((args: { data: object }) =>
          Promise.resolve({ ...(payout ?? {}), ...args.data }),
        ),
    },
    sellerEarning: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    sellerProfile: {
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
  // Notifications are fire-and-forget; a resolved stub keeps the state-machine
  // tests focused on the transition logic.
  const sellerNotifications = {
    notifyPayoutApproved: jest.fn().mockResolvedValue(undefined),
    notifyPayoutPaid: jest.fn().mockResolvedValue(undefined),
    notifyPayoutRejected: jest.fn().mockResolvedValue(undefined),
  };
  const earningsService = {
    getEligibleEarnings: jest.fn().mockResolvedValue([]),
  };
  const service = new PayoutsService(
    prisma as never,
    sellerNotifications as never,
    earningsService as never,
  );
  return { service, prisma, sellerNotifications, earningsService };
}

describe('PayoutsService — process (APPROVED → PROCESSING)', () => {
  it('moves an APPROVED payout to PROCESSING', async () => {
    const { service, prisma } = makeService({
      id: 'p1',
      status: PayoutStatus.APPROVED,
    });
    const res = await service.processPayout('p1', 'admin1');
    expect(prisma.payout.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: PayoutStatus.PROCESSING },
    });
    expect(res.status).toBe(PayoutStatus.PROCESSING);
  });

  it('rejects processing a payout that is not APPROVED', async () => {
    const { service } = makeService({
      id: 'p1',
      status: PayoutStatus.REQUESTED,
    });
    await expect(service.processPayout('p1', 'admin1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws NotFound for a missing payout', async () => {
    const { service } = makeService(null);
    await expect(service.processPayout('nope', 'admin1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('PayoutsService — complete (→ COMPLETED, terminal)', () => {
  it('completes an APPROVED payout with reference + processedAt, and notifies the seller', async () => {
    const { service, prisma, sellerNotifications } = makeService({
      id: 'p1',
      status: PayoutStatus.APPROVED,
    });
    const res = await service.completePayout('p1', 'admin1', 'MPESA-XYZ-123');
    const updateArg = prisma.payout.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'p1' });
    expect(updateArg.data.status).toBe(PayoutStatus.COMPLETED);
    expect(updateArg.data.externalReference).toBe('MPESA-XYZ-123');
    expect(updateArg.data.processedAt).toBeInstanceOf(Date);
    expect(res.status).toBe(PayoutStatus.COMPLETED);
    expect(sellerNotifications.notifyPayoutPaid).toHaveBeenCalledWith('p1');
  });

  it('completes a PROCESSING payout', async () => {
    const { service } = makeService({
      id: 'p1',
      status: PayoutStatus.PROCESSING,
    });
    const res = await service.completePayout('p1', 'admin1', 'CASH-001');
    expect(res.status).toBe(PayoutStatus.COMPLETED);
  });

  it('refuses to complete a REQUESTED payout (must be approved first)', async () => {
    const { service } = makeService({
      id: 'p1',
      status: PayoutStatus.REQUESTED,
    });
    await expect(service.completePayout('p1', 'admin1', 'ref')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses to re-complete an already COMPLETED payout (idempotent guard)', async () => {
    const { service } = makeService({
      id: 'p1',
      status: PayoutStatus.COMPLETED,
    });
    await expect(service.completePayout('p1', 'admin1', 'ref')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('PayoutsService — reject unlinks earnings', () => {
  it('flips to REJECTED, unlinks earnings (back to the eligible pool), and notifies the seller', async () => {
    const { service, prisma, sellerNotifications } = makeService({
      id: 'p1',
      status: PayoutStatus.APPROVED,
      sellerProfileId: 'seller1',
      amountCDF: BigInt(700000),
      earnings: [{ id: 'e1' }, { id: 'e2' }],
    });
    await service.rejectPayout('p1', 'admin1', 'wrong amount');

    expect(prisma.payout.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: PayoutStatus.REJECTED, rejectionReason: 'wrong amount' },
    });
    expect(prisma.sellerEarning.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e1', 'e2'] } },
      data: { isPaid: false, payoutId: null },
    });
    // Lazy model: no walletBalanceCDF mutation — unlinking restores eligibility.
    expect(prisma.sellerProfile.update).not.toHaveBeenCalled();
    expect(sellerNotifications.notifyPayoutRejected).toHaveBeenCalledWith('p1');
  });

  it('refuses to reject a COMPLETED payout', async () => {
    const { service } = makeService({
      id: 'p1',
      status: PayoutStatus.COMPLETED,
      earnings: [],
    });
    await expect(
      service.rejectPayout('p1', 'admin1', 'too late'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('PayoutsService — reusable payout destination (B1)', () => {
  it('updatePayoutMethod saves the method + phone on the profile', async () => {
    const prisma = {
      sellerProfile: {
        update: jest.fn().mockResolvedValue({
          payoutMethod: 'M_PESA',
          payoutPhone: '+243970000001',
        }),
      },
    };
    const service = new PayoutsService(
      prisma as never,
      {} as never,
      {} as never,
    );
    const res = await service.updatePayoutMethod('seller1', {
      payoutMethod: 'M_PESA',
      payoutPhone: '+243970000001',
    });
    expect(prisma.sellerProfile.update).toHaveBeenCalledWith({
      where: { id: 'seller1' },
      data: { payoutMethod: 'M_PESA', payoutPhone: '+243970000001' },
      select: { payoutMethod: true, payoutPhone: true },
    });
    expect(res.payoutMethod).toBe('M_PESA');
  });

  it('requestPayout rejects when no destination is saved and none is provided', async () => {
    const prisma = {
      sellerProfile: {
        findUnique: jest.fn().mockResolvedValue({
          payoutMethod: null,
          payoutPhone: null,
        }),
      },
      payout: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    // Above the 5 000 CDF minimum via eligible (window-cleared) earnings.
    const earningsService = {
      getEligibleEarnings: jest
        .fn()
        .mockResolvedValue([{ id: 'e1', netAmountCDF: BigInt(600000) }]),
    };
    const service = new PayoutsService(
      prisma as never,
      {} as never,
      earningsService as never,
    );
    await expect(service.requestPayout('seller1', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('requestPayout falls back to the saved destination when the body omits it', async () => {
    const prisma = {
      sellerProfile: {
        findUnique: jest.fn().mockResolvedValue({
          payoutMethod: 'AIRTEL_MONEY',
          payoutPhone: '+243990000002',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      payout: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue({ id: 'pay1', status: PayoutStatus.REQUESTED }),
      },
      sellerEarning: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (cb: (tx: typeof prisma) => unknown) => cb(prisma),
    );
    const earningsService = {
      getEligibleEarnings: jest
        .fn()
        .mockResolvedValue([{ id: 'e1', netAmountCDF: BigInt(600000) }]),
    };
    const service = new PayoutsService(
      prisma as never,
      {} as never,
      earningsService as never,
    );
    await service.requestPayout('seller1', {});
    expect(prisma.payout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payoutMethod: 'AIRTEL_MONEY',
          payoutPhone: '+243990000002',
        }),
      }),
    );
  });
});
