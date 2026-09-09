import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PayoutStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  OPEN_PAYOUT_STATUSES,
  PAYOUT_METHOD_COOLING_OFF_MS,
  PayoutsService,
  maskPayoutPhone,
  payoutsAvailableAt,
} from './payouts.service';

const noRateLimit = () => ({
  assertNotBlocked: jest.fn().mockResolvedValue(undefined),
  enforce: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
});

// Hand-rolled Prisma mock per delegate (project convention). `$transaction`
// runs its callback against the same object, so every guarded transition and
// the audit row are exercised end to end.
function makeService(
  payout: Record<string, unknown> | null,
  opts: { updateCount?: number; statusAfterRace?: PayoutStatus } = {},
) {
  const state = { row: payout as Record<string, unknown> | null };
  const prisma = {
    payout: {
      findUnique: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            state.row && opts.statusAfterRace
              ? { ...state.row, status: opts.statusAfterRace }
              : state.row,
          ),
        ),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockImplementation((args: { data: object }) => {
        const count = opts.updateCount ?? 1;
        if (count === 1 && state.row)
          state.row = { ...state.row, ...args.data };
        return Promise.resolve({ count });
      }),
      create: jest.fn(),
    },
    sellerEarning: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    sellerProfile: { update: jest.fn().mockResolvedValue({}) },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
  const sellerNotifications = {
    notifyPayoutApproved: jest.fn().mockResolvedValue(undefined),
    notifyPayoutPaid: jest.fn().mockResolvedValue(undefined),
    notifyPayoutRejected: jest.fn().mockResolvedValue(undefined),
    notifyPayoutMethodChanged: jest.fn().mockResolvedValue(undefined),
  };
  const earningsService = {
    getEligibleEarnings: jest.fn().mockResolvedValue([]),
  };
  const audit = {
    record: jest
      .fn()
      .mockImplementation((tx: typeof prisma, entry: unknown) =>
        tx.adminAuditLog.create({ data: entry }),
      ),
  };
  const service = new PayoutsService(
    prisma as never,
    sellerNotifications as never,
    earningsService as never,
    audit as never,
    noRateLimit() as never,
  );
  return { service, prisma, sellerNotifications, earningsService, audit };
}

const p = (status: PayoutStatus) => ({
  id: 'p1',
  sellerProfileId: 'seller1',
  status,
  amountCDF: BigInt(700000),
  externalReference: null,
  rejectionReason: null,
});

describe('PayoutsService — transitions are conditional updates in a transaction', () => {
  it('approve: REQUESTED → APPROVED with actor, audit row, seller notified', async () => {
    const { service, prisma, sellerNotifications, audit } = makeService(
      p(PayoutStatus.REQUESTED),
    );
    const res = await service.approvePayout('p1', 'admin1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const arg = prisma.payout.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: 'p1',
      status: { in: [PayoutStatus.REQUESTED] },
    });
    expect(arg.data.status).toBe(PayoutStatus.APPROVED);
    expect(arg.data.approvedById).toBe('admin1');
    expect(arg.data.approvedAt).toBeInstanceOf(Date);
    expect(res.status).toBe(PayoutStatus.APPROVED);
    expect(audit.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: 'PAYOUT_APPROVED',
        actorId: 'admin1',
        entityId: 'p1',
      }),
    );
    expect(sellerNotifications.notifyPayoutApproved).toHaveBeenCalledWith('p1');
    // Approval is authorization only: no "paid" notification, no earning change.
    expect(sellerNotifications.notifyPayoutPaid).not.toHaveBeenCalled();
    expect(prisma.sellerEarning.updateMany).not.toHaveBeenCalled();
  });

  it('process: APPROVED → PROCESSING records the actor, no notification', async () => {
    const { service, prisma, sellerNotifications } = makeService(
      p(PayoutStatus.APPROVED),
    );
    const res = await service.processPayout('p1', 'admin1');
    const arg = prisma.payout.updateMany.mock.calls[0][0];
    expect(arg.where.status).toEqual({ in: [PayoutStatus.APPROVED] });
    expect(arg.data.processingById).toBe('admin1');
    expect(res.status).toBe(PayoutStatus.PROCESSING);
    expect(sellerNotifications.notifyPayoutApproved).not.toHaveBeenCalled();
    expect(sellerNotifications.notifyPayoutPaid).not.toHaveBeenCalled();
  });

  it('complete: APPROVED|PROCESSING → COMPLETED with reference, actor, processedAt; seller told "paid" only here', async () => {
    const { service, prisma, sellerNotifications, audit } = makeService(
      p(PayoutStatus.PROCESSING),
    );
    const res = await service.completePayout('p1', 'admin1', 'MPESA-XYZ-123');
    const arg = prisma.payout.updateMany.mock.calls[0][0];
    expect(arg.where.status).toEqual({
      in: [PayoutStatus.APPROVED, PayoutStatus.PROCESSING],
    });
    expect(arg.data.externalReference).toBe('MPESA-XYZ-123');
    expect(arg.data.completedById).toBe('admin1');
    expect(arg.data.processedAt).toBeInstanceOf(Date);
    expect(res.status).toBe(PayoutStatus.COMPLETED);
    expect(sellerNotifications.notifyPayoutPaid).toHaveBeenCalledWith('p1');
    expect(audit.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: 'PAYOUT_COMPLETED',
        reason: 'MPESA-XYZ-123',
      }),
    );
  });

  it('reject: releases the reserved earnings by payoutId in the same transaction and records reason + actor', async () => {
    const { service, prisma, sellerNotifications } = makeService(
      p(PayoutStatus.APPROVED),
    );
    const res = await service.rejectPayout('p1', 'admin1', 'wrong amount');
    const arg = prisma.payout.updateMany.mock.calls[0][0];
    expect(arg.where.status).toEqual({ in: OPEN_PAYOUT_STATUSES });
    expect(arg.data.rejectionReason).toBe('wrong amount');
    expect(arg.data.rejectedById).toBe('admin1');
    expect(prisma.sellerEarning.updateMany).toHaveBeenCalledWith({
      where: { payoutId: 'p1' },
      data: { isPaid: false, payoutId: null },
    });
    expect(prisma.sellerProfile.update).not.toHaveBeenCalled();
    expect(res.status).toBe(PayoutStatus.REJECTED);
    expect(sellerNotifications.notifyPayoutRejected).toHaveBeenCalledWith('p1', { failedTransfer: false });
  });

  it('D1: a PROCESSING payout can be rejected (failed transfer is not a dead end)', async () => {
    const { service, prisma } = makeService(p(PayoutStatus.PROCESSING));
    const res = await service.rejectPayout('p1', 'admin1', 'transfer failed');
    expect(res.status).toBe(PayoutStatus.REJECTED);
    expect(prisma.sellerEarning.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('PayoutsService — double-apply / race protection', () => {
  it('a second complete() finds count=0 and fails WITHOUT re-notifying or re-auditing', async () => {
    const { service, sellerNotifications, audit } = makeService(
      p(PayoutStatus.COMPLETED),
      {
        updateCount: 0,
      },
    );
    await expect(
      service.completePayout('p1', 'admin1', 'ref-2'),
    ).rejects.toThrow(ConflictException);
    expect(sellerNotifications.notifyPayoutPaid).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('a lost race reports the CURRENT status, not the stale one', async () => {
    const { service } = makeService(p(PayoutStatus.REQUESTED), {
      updateCount: 0,
      statusAfterRace: PayoutStatus.REJECTED,
    });
    await expect(service.approvePayout('p1', 'admin1')).rejects.toThrow(
      /"REJECTED"/,
    );
  });

  it('wrong-state transitions are refused (REQUESTED cannot be completed; COMPLETED cannot be rejected)', async () => {
    const a = makeService(p(PayoutStatus.REQUESTED), { updateCount: 0 });
    await expect(
      a.service.completePayout('p1', 'admin1', 'ref'),
    ).rejects.toThrow(ConflictException);
    const b = makeService(p(PayoutStatus.COMPLETED), { updateCount: 0 });
    await expect(
      b.service.rejectPayout('p1', 'admin1', 'late'),
    ).rejects.toThrow(ConflictException);
    expect(b.prisma.sellerEarning.updateMany).not.toHaveBeenCalled();
  });

  it('missing payout → 404 and nothing written', async () => {
    const { service, prisma } = makeService(null);
    await expect(service.approvePayout('nope', 'admin1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.payout.updateMany).not.toHaveBeenCalled();
  });
});

describe('PayoutsService.requestPayout — one transaction, row lock, guarded reservation', () => {
  function makeRequest(opts: {
    profile?: {
      payoutMethod: string | null;
      payoutPhone: string | null;
      payoutMethodChangedAt?: Date | null;
    } | null;
    open?: unknown;
    eligible?: { id: string; netAmountCDF: bigint }[];
    reservedCount?: number;
    createError?: Error;
  }) {
    const eligible = opts.eligible ?? [
      { id: 'e1', netAmountCDF: BigInt(400000) },
      { id: 'e2', netAmountCDF: BigInt(300000) },
    ];
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue(
          opts.profile === null
            ? []
            : [
                {
                  id: 'seller1',
                  payoutMethodChangedAt: null,
                  ...(opts.profile ?? {
                    payoutMethod: 'M_PESA',
                    payoutPhone: '+243970000001',
                  }),
                },
              ],
        ),
      payout: {
        findFirst: jest.fn().mockResolvedValue(opts.open ?? null),
        create: jest
          .fn()
          .mockImplementation(() =>
            opts.createError
              ? Promise.reject(opts.createError)
              : Promise.resolve({ id: 'pay1', status: PayoutStatus.REQUESTED }),
          ),
      },
      sellerEarning: {
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: opts.reservedCount ?? eligible.length }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (cb: (tx: typeof prisma) => unknown) => cb(prisma),
    );
    const earningsService = {
      getEligibleEarnings: jest.fn().mockResolvedValue(eligible),
    };
    const service = new PayoutsService(
      prisma as never,
      {} as never,
      earningsService as never,
      {} as never,
      noRateLimit() as never,
    );
    return { service, prisma, earningsService };
  }

  it('locks the seller row, reads eligibility under the lock, reserves exactly those rows', async () => {
    const { service, prisma, earningsService } = makeRequest({});
    const res = await service.requestPayout('seller1', {});
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1); // SELECT … FOR UPDATE
    expect(earningsService.getEligibleEarnings).toHaveBeenCalledWith(
      'seller1',
      prisma,
    );
    expect(prisma.payout.findFirst).toHaveBeenCalledWith({
      where: {
        sellerProfileId: 'seller1',
        status: { in: OPEN_PAYOUT_STATUSES },
      },
      select: { id: true },
    });
    expect(prisma.payout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountCDF: BigInt(700000),
          payoutMethod: 'M_PESA',
        }),
      }),
    );
    expect(prisma.sellerEarning.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['e1', 'e2'] },
        isPaid: false,
        payoutId: null,
        reversedAt: null,
      },
      data: { isPaid: true, payoutId: 'pay1' },
    });
    expect(res.id).toBe('pay1');
  });

  it('D2: an open REQUESTED / APPROVED / PROCESSING payout blocks a new request', async () => {
    const { service, prisma } = makeRequest({ open: { id: 'existing' } });
    await expect(service.requestPayout('seller1', {})).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.payout.create).not.toHaveBeenCalled();
    expect(OPEN_PAYOUT_STATUSES).toContain(PayoutStatus.PROCESSING);
  });

  it('same earning cannot fund two payouts: a reservation count mismatch aborts the transaction', async () => {
    const { service } = makeRequest({ reservedCount: 1 });
    await expect(service.requestPayout('seller1', {})).rejects.toThrow(
      ConflictException,
    );
  });

  it('the partial unique index (P2002) surfaces as the same 409', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service } = makeRequest({ createError: err });
    await expect(service.requestPayout('seller1', {})).rejects.toThrow(
      ConflictException,
    );
  });

  it('below the 5 000 FC minimum → 400, nothing created', async () => {
    const { service, prisma } = makeRequest({
      eligible: [{ id: 'e1', netAmountCDF: BigInt(499999) }],
    });
    await expect(service.requestPayout('seller1', {})).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.payout.create).not.toHaveBeenCalled();
  });

  it('no destination saved and none provided → 400', async () => {
    const { service } = makeRequest({
      profile: { payoutMethod: null, payoutPhone: null },
    });
    await expect(service.requestPayout('seller1', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  // ---- S12: the SAVED destination is the only routing authority ----
  it('S12: a body destination that differs from the saved one → 409, nothing created, nothing reserved', async () => {
    const { service, prisma } = makeRequest({});
    await expect(
      service.requestPayout('seller1', {
        payoutMethod: 'AIRTEL_MONEY',
        payoutPhone: '+243990000002',
      }),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.requestPayout('seller1', { payoutPhone: '+243990000002' }),
    ).rejects.toThrow(/ne correspond pas à celle enregistrée/);
    expect(prisma.payout.create).not.toHaveBeenCalled();
    expect(prisma.sellerEarning.updateMany).not.toHaveBeenCalled();
  });

  it('S12: a body destination equal to the saved one is tolerated (old clients) and the SAVED one is snapshotted', async () => {
    const { service, prisma } = makeRequest({});
    await service.requestPayout('seller1', {
      payoutMethod: 'M_PESA',
      payoutPhone: '+243970000001',
    });
    expect(prisma.payout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payoutMethod: 'M_PESA',
          payoutPhone: '+243970000001',
        }),
      }),
    );
  });

  it('S12: no body destination → the saved one is snapshotted', async () => {
    const { service, prisma } = makeRequest({});
    await service.requestPayout('seller1', {});
    expect(prisma.payout.create.mock.calls[0][0].data).toMatchObject({
      payoutMethod: 'M_PESA',
      payoutPhone: '+243970000001',
    });
  });

  it('S12: a destination changed 1 h ago → 409 naming the reopen time, nothing created', async () => {
    const changedAt = new Date(Date.now() - 60 * 60 * 1000);
    const { service, prisma } = makeRequest({
      profile: {
        payoutMethod: 'M_PESA',
        payoutPhone: '+243970000001',
        payoutMethodChangedAt: changedAt,
      },
    });
    await expect(service.requestPayout('seller1', {})).rejects.toThrow(
      /modifiée récemment.*à partir du/,
    );
    expect(prisma.payout.create).not.toHaveBeenCalled();
    expect(prisma.sellerEarning.updateMany).not.toHaveBeenCalled();
  });

  it('S12: a destination changed 25 h ago is settled — the request goes through', async () => {
    const { service, prisma } = makeRequest({
      profile: {
        payoutMethod: 'M_PESA',
        payoutPhone: '+243970000001',
        payoutMethodChangedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      },
    });
    await service.requestPayout('seller1', {});
    expect(prisma.payout.create).toHaveBeenCalledTimes(1);
  });

  it('S12: the cooling-off is read under the SAME row lock as the balance (one SELECT … FOR UPDATE, includes payoutMethodChangedAt)', async () => {
    const { service, prisma } = makeRequest({});
    await service.requestPayout('seller1', {});
    const sql = (prisma.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toMatch(/"payoutMethodChangedAt"/);
    expect(sql).toMatch(/FOR UPDATE/);
  });

  it('unknown seller → 404', async () => {
    const { service } = makeRequest({ profile: null });
    await expect(service.requestPayout('ghost', {})).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('PayoutsService — reusable payout destination (S12: re-auth, cooling-off, audit, notice)', () => {
  const HASH = bcrypt.hashSync('Secret123!', 4);
  const SAVED = { payoutMethod: 'M_PESA', payoutPhone: '+243970000001', payoutMethodChangedAt: null as Date | null };

  function makeUpdate(opts: {
    saved?: typeof SAVED | null;
    lockedSaved?: typeof SAVED; // what the row looks like under the lock (race)
    user?: { id: string; email: string | null; passwordHash: string | null } | null;
  } = {}) {
    const saved = opts.saved === undefined ? SAVED : opts.saved;
    const prisma = {
      sellerProfile: {
        findUnique: jest.fn().mockResolvedValue(saved),
        update: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
          Promise.resolve({
            payoutMethod: args.data.payoutMethod,
            payoutPhone: args.data.payoutPhone,
            payoutMethodChangedAt: args.data.payoutMethodChangedAt,
          }),
        ),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(
          opts.user === undefined
            ? { id: 'u1', email: 'marie@example.cd', passwordHash: HASH }
            : opts.user,
        ),
      },
      adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn().mockResolvedValue(
        saved === null ? [] : [{ id: 'seller1', ...(opts.lockedSaved ?? saved) }],
      ),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) => cb(prisma));
    const sellerNotifications = { notifyPayoutMethodChanged: jest.fn().mockResolvedValue(undefined) };
    const audit = {
      record: jest.fn().mockImplementation((tx: typeof prisma, entry: unknown) => tx.adminAuditLog.create({ data: entry })),
    };
    const rateLimit = noRateLimit();
    const service = new PayoutsService(prisma as never, sellerNotifications as never, {} as never, audit as never, rateLimit as never);
    return { service, prisma, sellerNotifications, audit, rateLimit };
  }

  it('an unchanged destination is a no-op: no password needed, nothing written, no audit, no notice', async () => {
    const { service, prisma, audit, sellerNotifications, rateLimit } = makeUpdate();
    const res = await service.updatePayoutMethod('seller1', 'u1', { payoutMethod: 'M_PESA', payoutPhone: '+243970000001' });
    expect(res).toEqual({ payoutMethod: 'M_PESA', payoutPhone: '+243970000001', changedAt: null, payoutsAvailableAt: null });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.sellerProfile.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(sellerNotifications.notifyPayoutMethodChanged).not.toHaveBeenCalled();
    expect(rateLimit.enforce).not.toHaveBeenCalled();
  });

  it('a real change without a password → 400 (French), password never verified, nothing written', async () => {
    const { service, prisma } = makeUpdate();
    await expect(
      service.updatePayoutMethod('seller1', 'u1', { payoutMethod: 'AIRTEL_MONEY', payoutPhone: '+243990000002' }),
    ).rejects.toThrow(/mot de passe est requis/);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.sellerProfile.update).not.toHaveBeenCalled();
  });

  it('a wrong password → generic 403 (never 401: clients would refresh + replay), counts in the login lock bucket by email, nothing written', async () => {
    const { service, prisma, rateLimit, audit } = makeUpdate();
    await expect(
      service.updatePayoutMethod('seller1', 'u1', { payoutMethod: 'AIRTEL_MONEY', payoutPhone: '+243990000002', password: 'nope' }),
    ).rejects.toThrow(ForbiddenException);
    expect(rateLimit.assertNotBlocked).toHaveBeenCalledWith('login', 'marie@example.cd');
    expect(rateLimit.enforce).toHaveBeenCalledWith('login', 'marie@example.cd');
    expect(prisma.sellerProfile.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('the correct password changes the destination under the row lock, stamps the cooling-off, audits with MASKED phones and notifies the seller — the password appears nowhere', async () => {
    const { service, prisma, audit, sellerNotifications, rateLimit } = makeUpdate();
    const before = Date.now();
    const res = await service.updatePayoutMethod('seller1', 'u1', {
      payoutMethod: 'AIRTEL_MONEY',
      payoutPhone: '+243990000002',
      password: 'Secret123!',
    });
    // row lock, same shape as requestPayout
    const sql = (prisma.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toMatch(/FOR UPDATE/);
    // write
    const data = prisma.sellerProfile.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ payoutMethod: 'AIRTEL_MONEY', payoutPhone: '+243990000002' });
    expect(data.payoutMethodChangedAt.getTime()).toBeGreaterThanOrEqual(before);
    // response
    expect(res.payoutMethod).toBe('AIRTEL_MONEY');
    expect(res.payoutsAvailableAt!.getTime() - res.changedAt!.getTime()).toBe(PAYOUT_METHOD_COOLING_OFF_MS);
    expect(JSON.stringify(res)).not.toMatch(/Secret123/);
    // audit: actor = the seller, masked phones only
    const entry = audit.record.mock.calls[0][1];
    expect(entry).toMatchObject({ actorId: 'u1', action: 'PAYOUT_METHOD_CHANGED', entityType: 'seller_profile', entityId: 'seller1' });
    expect(entry.before.payoutPhone).toBe('+243•••••01');
    expect(entry.after.payoutPhone).toBe('+243•••••02');
    expect(JSON.stringify(entry)).not.toMatch(/970000001|990000002|Secret123/);
    // notice (after commit): masked phone, both dates
    expect(sellerNotifications.notifyPayoutMethodChanged).toHaveBeenCalledWith('u1', expect.objectContaining({ payoutMethod: 'AIRTEL_MONEY', maskedPhone: '+243•••••02' }));
    expect(JSON.stringify(sellerNotifications.notifyPayoutMethodChanged.mock.calls[0])).not.toMatch(/Secret123|990000002/);
    expect(rateLimit.enforce).not.toHaveBeenCalled();
  });

  it('race: the pre-read differs but the row is already identical under the lock → no-op (no update, no audit)', async () => {
    const { service, prisma, audit, sellerNotifications } = makeUpdate({
      saved: SAVED,
      lockedSaved: { payoutMethod: 'AIRTEL_MONEY', payoutPhone: '+243990000002', payoutMethodChangedAt: new Date() },
    });
    const res = await service.updatePayoutMethod('seller1', 'u1', {
      payoutMethod: 'AIRTEL_MONEY',
      payoutPhone: '+243990000002',
      password: 'Secret123!',
    });
    expect(res.payoutMethod).toBe('AIRTEL_MONEY');
    expect(prisma.sellerProfile.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(sellerNotifications.notifyPayoutMethodChanged).not.toHaveBeenCalled();
  });

  it('unknown profile → 404; an account without a password → 400', async () => {
    await expect(
      makeUpdate({ saved: null }).service.updatePayoutMethod('ghost', 'u1', { payoutMethod: 'M_PESA', payoutPhone: '+243970000001', password: 'x' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      makeUpdate({ user: { id: 'u1', email: 'e@x.cd', passwordHash: null } }).service.updatePayoutMethod('seller1', 'u1', { payoutMethod: 'AIRTEL_MONEY', payoutPhone: '+243990000002', password: 'x' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('getPayoutMethod exposes the cooling-off state (payoutsAvailableAt) without any secret', async () => {
    const changedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { service } = makeUpdate({ saved: { ...SAVED, payoutMethodChangedAt: changedAt } });
    const res = await service.getPayoutMethod('seller1');
    expect(res.payoutsAvailableAt!.getTime()).toBe(changedAt.getTime() + PAYOUT_METHOD_COOLING_OFF_MS);
    expect(Object.keys(res).sort()).toEqual(['changedAt', 'payoutMethod', 'payoutPhone', 'payoutsAvailableAt']);
  });

  it('helpers: masking keeps only the country code + last two digits; availability is null once settled', () => {
    expect(maskPayoutPhone('+243970000001')).toBe('+243•••••01');
    expect(maskPayoutPhone(null)).toBeNull();
    expect(payoutsAvailableAt(null)).toBeNull();
    expect(payoutsAvailableAt(new Date(Date.now() - PAYOUT_METHOD_COOLING_OFF_MS - 1))).toBeNull();
    expect(payoutsAvailableAt(new Date())).not.toBeNull();
  });
});

describe('PayoutsService.getPayoutById — operator decision context', () => {
  it('adds seller balances, resolved actors and the audit trail to the row', async () => {
    const prisma = {
      payout: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p1',
          sellerProfileId: 'sp1',
          status: PayoutStatus.PROCESSING,
          amountCDF: BigInt(6300000),
          approvedById: 'admin1',
          processingById: 'admin2',
          completedById: null,
          rejectedById: null,
          earnings: [],
        }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'admin1', firstName: 'Aline', lastName: 'K.' },
          { id: 'admin2', firstName: 'Bob', lastName: 'M.' },
        ]),
      },
    };
    const earningsService = {
      getBalances: jest.fn().mockResolvedValue({
        availableCDF: BigInt(0),
        pendingCDF: BigInt(250000),
        totalEarnedCDF: BigInt(7000000),
        totalCommissionCDF: BigInt(700000),
      }),
    };
    const audit = {
      listForEntity: jest.fn().mockResolvedValue([
        { id: 'a2', action: 'PAYOUT_PROCESSING', actorId: 'admin2', before: {}, after: {}, reason: null, createdAt: new Date() },
        { id: 'a1', action: 'PAYOUT_APPROVED', actorId: 'admin1', before: {}, after: {}, reason: null, createdAt: new Date() },
      ]),
    };
    const service = new PayoutsService(prisma as never, {} as never, earningsService as never, audit as never, noRateLimit() as never);
    const res = await service.getPayoutById('p1');
    expect(res.balances).toEqual({
      availableCDF: '0',
      pendingCDF: '250000',
      totalEarnedCDF: '7000000',
      totalCommissionCDF: '700000',
    });
    expect(res.actors.approvedBy).toEqual({ id: 'admin1', firstName: 'Aline', lastName: 'K.' });
    expect(res.actors.processingBy?.firstName).toBe('Bob');
    expect(res.actors.completedBy).toBeNull();
    expect(res.auditTrail.map((a) => a.action)).toEqual(['PAYOUT_PROCESSING', 'PAYOUT_APPROVED']);
    expect(res.auditTrail[1].actorName?.firstName).toBe('Aline');
    expect(audit.listForEntity).toHaveBeenCalledWith('payout', 'p1');
    // Never exposes password hashes or anything beyond names for actors.
    expect(prisma.user.findMany.mock.calls[0][0].select).toEqual({ id: true, firstName: true, lastName: true });
  });
});

describe('PayoutsService — seller-facing payout detail (deep-link target) and rejection variants', () => {
  it('getSellerPayoutById is owner-scoped: the seller id is in the WHERE, and any miss is one 404', async () => {
    const prisma = { payout: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new PayoutsService(prisma as never, {} as never, {} as never, {} as never, noRateLimit() as never);
    await expect(service.getSellerPayoutById('sp1', 'pay-of-someone-else')).rejects.toThrow(
      /introuvable ou ne vous appartient pas/,
    );
    expect(prisma.payout.findFirst.mock.calls[0][0].where).toEqual({ id: 'pay-of-someone-else', sellerProfileId: 'sp1' });
    prisma.payout.findFirst.mockResolvedValue({ id: 'pay1', sellerProfileId: 'sp1', status: 'COMPLETED' });
    await expect(service.getSellerPayoutById('sp1', 'pay1')).resolves.toMatchObject({ id: 'pay1' });
  });

  it('reject from PROCESSING tells the notifier it was a failed transfer; from REQUESTED it does not', async () => {
    const a = makeService(p(PayoutStatus.PROCESSING));
    await a.service.rejectPayout('p1', 'admin1', 'Transfert refusé par l’opérateur');
    expect(a.sellerNotifications.notifyPayoutRejected).toHaveBeenCalledWith('p1', { failedTransfer: true });
    const b = makeService(p(PayoutStatus.REQUESTED));
    await b.service.rejectPayout('p1', 'admin1', 'Justificatif manquant');
    expect(b.sellerNotifications.notifyPayoutRejected).toHaveBeenCalledWith('p1', { failedTransfer: false });
  });
});
