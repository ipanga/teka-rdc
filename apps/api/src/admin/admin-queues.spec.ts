import { PayoutStatus } from '@prisma/client';
import { ADMIN_QUEUES } from './admin-queues';
import { AdminStatsService } from './admin-stats.service';
import { AdminUsersService } from './admin-users.service';

// Count/queue reconciliation: the dashboard counter and the list the tile
// links to must be produced by the SAME where. These tests capture the
// `where` each service passes to Prisma and compare it with ADMIN_QUEUES.
function statsPrisma() {
  const captured: Record<string, unknown[]> = {};
  const cap = (name: string, value: unknown) => {
    (captured[name] ??= []).push(value);
  };
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(0) },
    order: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalCDF: null } }),
      groupBy: jest.fn().mockResolvedValue([
        { status: 'READY_FOR_TEKA_PICKUP', _count: { _all: 6 } },
        { status: 'RECEIVED_AT_TEKA', _count: { _all: 2 } },
      ]),
    },
    sellerEarning: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { commissionCDF: null } }),
    },
    payout: {
      aggregate: jest.fn().mockImplementation((args: { where: unknown }) => {
        cap('payout.aggregate', args.where);
        const w = JSON.stringify(args.where);
        return Promise.resolve(
          w.includes('REQUESTED')
            ? { _count: 4, _sum: { amountCDF: 90000000n } }
            : { _count: 3, _sum: { amountCDF: 12000000n } },
        );
      }),
      count: jest.fn().mockImplementation((args: { where: unknown }) => {
        cap('payout.count', args.where);
        return Promise.resolve(1);
      }),
    },
    sellerProfile: {
      count: jest.fn().mockImplementation((args: { where: unknown }) => {
        cap('sellerProfile.count', args.where);
        return Promise.resolve(
          JSON.stringify(args.where).includes('PENDING') ? 7 : 2,
        );
      }),
    },
    product: {
      count: jest.fn().mockImplementation((args: { where: unknown }) => {
        cap('product.count', args.where);
        return Promise.resolve(5);
      }),
    },
    returnRequest: {
      count: jest.fn().mockImplementation((args: { where: unknown }) => {
        cap('returnRequest.count', args.where);
        return Promise.resolve(8);
      }),
    },
  };
  return { prisma, captured };
}

describe('Admin action center — counts and queues share one definition', () => {
  it('stats counters use the ADMIN_QUEUES where builders', async () => {
    const { prisma, captured } = statsPrisma();
    const res = await new AdminStatsService(
      prisma as never,
    ).getDashboardStats();

    expect(captured['sellerProfile.count']).toContainEqual(
      ADMIN_QUEUES.sellerApplicationsPending(),
    );
    expect(captured['product.count']).toContainEqual(
      ADMIN_QUEUES.productsPendingReview(),
    );
    expect(captured['returnRequest.count']).toContainEqual(
      ADMIN_QUEUES.returnsPending(),
    );
    expect(captured['payout.aggregate']).toContainEqual(
      ADMIN_QUEUES.payoutsAwaitingReview(),
    );
    expect(captured['payout.aggregate']).toContainEqual(
      ADMIN_QUEUES.payoutsAwaitingPayment(),
    );

    const ac = res.data.actionCenter;
    expect(ac).toEqual({
      sellerApplicationsPending: 7,
      productsPendingReview: 5,
      returnsPending: 8,
      ordersReadyForPickup: 6,
      ordersReceivedAtTeka: 2,
      payoutsAwaitingReview: { count: 4, amountCDF: '90000000' },
      payoutsAwaitingPayment: {
        count: 3,
        processingCount: 1,
        amountCDF: '12000000',
      },
    });
    // Legacy fields stay for existing consumers.
    expect(res.data.pendingPayoutsCount).toBe(4);
    expect(res.data.pendingSellerApplicationsCount).toBe(7);
  });

  it('the payouts queue definitions match the list endpoint status filters', () => {
    // /v1/admin/payouts?status=X filters `{ status: X }`; the review queue is
    // exactly that for REQUESTED, and the payment queue is the union the
    // dashboard tile explains (APPROVED, plus PROCESSING).
    expect(ADMIN_QUEUES.payoutsAwaitingReview()).toEqual({
      status: PayoutStatus.REQUESTED,
    });
    expect(ADMIN_QUEUES.payoutsAwaitingPayment()).toEqual({
      status: { in: [PayoutStatus.APPROVED, PayoutStatus.PROCESSING] },
    });
  });

  it('GET /v1/admin/sellers/applications?status=PENDING uses the same where as the dashboard count', async () => {
    const prisma = {
      sellerProfile: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new AdminUsersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await service.findSellerApplications({ status: 'PENDING' });
    expect(prisma.sellerProfile.findMany.mock.calls[0][0].where).toEqual(
      ADMIN_QUEUES.sellerApplicationsPending(),
    );
    expect(prisma.sellerProfile.count.mock.calls[0][0].where).toEqual(
      ADMIN_QUEUES.sellerApplicationsPending(),
    );
  });

  it('queue definitions exclude soft-deleted rows where the model has deletedAt', () => {
    expect(ADMIN_QUEUES.sellerApplicationsPending()).toMatchObject({
      deletedAt: null,
    });
    expect(ADMIN_QUEUES.productsPendingReview()).toMatchObject({
      deletedAt: null,
    });
    expect(ADMIN_QUEUES.returnsPending()).toMatchObject({ deletedAt: null });
    expect(ADMIN_QUEUES.ordersReadyForPickup()).toMatchObject({
      deletedAt: null,
    });
    expect(ADMIN_QUEUES.ordersReceivedAtTeka()).toMatchObject({
      deletedAt: null,
    });
  });
});
