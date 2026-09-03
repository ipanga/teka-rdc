import { ReportsService } from './reports.service';

// Unit coverage for the payouts reconciliation report (Payouts
// Operationalization Phase D / D2). Hand-rolled Prisma mock, mirroring the
// project's other *.service.spec.ts files.
function makeService(payouts: Record<string, unknown>[]) {
  const prisma = {
    payout: {
      findMany: jest.fn().mockResolvedValue(payouts),
      count: jest.fn().mockResolvedValue(payouts.length),
    },
  };
  return { service: new ReportsService(prisma as never), prisma };
}

describe('ReportsService.getPayoutsReport (D2)', () => {
  it('maps payout rows to the reconciliation report shape', async () => {
    const { service } = makeService([
      {
        createdAt: new Date('2026-06-08T10:00:00Z'),
        amountCDF: BigInt(630000),
        payoutMethod: 'M_PESA',
        payoutPhone: '+243970000001',
        status: 'COMPLETED',
        externalReference: 'MPESA-1',
        processedAt: new Date('2026-06-09T08:00:00Z'),
        rejectionReason: null,
        sellerProfile: {
          businessName: 'Boutique Marie',
          user: { firstName: 'Marie', lastName: 'K' },
        },
      },
    ]);

    const res = await service.getPayoutsReport({});
    expect(res.data[0]).toMatchObject({
      date: '2026-06-08',
      sellerName: 'Marie K',
      businessName: 'Boutique Marie',
      amountCDF: '630000',
      method: 'M_PESA',
      phone: '+243970000001',
      status: 'COMPLETED',
      reference: 'MPESA-1',
      processedAt: '2026-06-09',
      rejectionReason: '',
    });
  });

  it('filters by sellerId via the sellerProfile relation', async () => {
    const { service, prisma } = makeService([]);
    await service.getPayoutsReport({
      sellerId: '10000000-0000-0000-0000-000000000002',
    });
    const arg = prisma.payout.findMany.mock.calls[0][0];
    expect(arg.where.sellerProfile).toEqual({
      userId: '10000000-0000-0000-0000-000000000002',
    });
  });
});

// ─── CSV generation (shared csv.util adoption) ───────────────────────────
//
// These lock in the two things the refactor promised: the emitted columns are
// unchanged, and user-controlled text can no longer smuggle a formula into a
// finance spreadsheet. Before the refactor `escapeCsv` did RFC-4180 quoting
// only, so a seller could name their shop `=cmd|'/c calc'!A1` and have it land
// in the payouts CSV verbatim.

function mockRes() {
  return { setHeader: jest.fn(), write: jest.fn(), end: jest.fn() };
}

/** All CSV body text written by a generator, header row included. */
function writtenCsv(res: { write: jest.Mock }): string {
  return res.write.mock.calls.map((c) => c[0] as string).join('');
}

describe('ReportsService CSV output', () => {
  it('keeps the payouts header row exactly as before the refactor', async () => {
    const { service } = makeService([]);
    const res = mockRes();
    await service.generatePayoutsCsv({}, res as never);
    expect(writtenCsv(res)).toContain(
      'Date,Seller,Business,Amount CDF,Method,Phone,Status,Reference,Processed At,Rejection Reason\n',
    );
  });

  it('writes the UTF-8 BOM so Excel renders French accents', async () => {
    const { service } = makeService([]);
    const res = mockRes();
    await service.generatePayoutsCsv({}, res as never);
    expect(res.write.mock.calls[0][0]).toBe('﻿');
  });

  it('neutralises a formula smuggled through a seller business name', async () => {
    const { service } = makeService([
      {
        createdAt: new Date('2026-06-08T10:00:00Z'),
        amountCDF: BigInt(630000),
        payoutMethod: 'M_PESA',
        payoutPhone: '+243970000001',
        status: 'COMPLETED',
        externalReference: 'MPESA-1',
        processedAt: new Date('2026-06-09T08:00:00Z'),
        rejectionReason: null,
        sellerProfile: {
          businessName: "=cmd|'/c calc'!A1",
          user: { firstName: 'Marie', lastName: 'K' },
        },
      },
    ]);
    const res = mockRes();
    await service.generatePayoutsCsv({}, res as never);

    const csv = writtenCsv(res);
    expect(csv).toContain(`"'=cmd|'/c calc'!A1"`);
    // The raw payload must not survive anywhere as a cell of its own.
    expect(csv).not.toContain(`,=cmd`);
  });

  it('keeps a +243 phone literal instead of letting Excel evaluate it', async () => {
    const { service } = makeService([
      {
        createdAt: new Date('2026-06-08T10:00:00Z'),
        amountCDF: BigInt(630000),
        payoutMethod: 'M_PESA',
        payoutPhone: '+243970000001',
        status: 'COMPLETED',
        externalReference: 'MPESA-1',
        processedAt: null,
        rejectionReason: null,
        sellerProfile: {
          businessName: 'Boutique Marie',
          user: { firstName: 'Marie', lastName: 'K' },
        },
      },
    ]);
    const res = mockRes();
    await service.generatePayoutsCsv({}, res as never);
    expect(writtenCsv(res)).toContain(`"'+243970000001"`);
  });

  it('emits amounts as bare integers, not formula-prefixed text', async () => {
    const { service } = makeService([
      {
        createdAt: new Date('2026-06-08T10:00:00Z'),
        amountCDF: BigInt(630000),
        payoutMethod: 'M_PESA',
        payoutPhone: '+243970000001',
        status: 'COMPLETED',
        externalReference: null,
        processedAt: null,
        rejectionReason: null,
        sellerProfile: {
          businessName: 'Boutique Marie',
          user: { firstName: 'Marie', lastName: 'K' },
        },
      },
    ]);
    const res = mockRes();
    await service.generatePayoutsCsv({}, res as never);
    expect(writtenCsv(res)).toContain(',630000,');
  });

  it('still produces a header-only file when there is nothing to export', async () => {
    const { service } = makeService([]);
    const res = mockRes();
    await service.generatePayoutsCsv({}, res as never);
    expect(res.write).toHaveBeenCalledTimes(2); // BOM + header row
    expect(res.end).toHaveBeenCalledTimes(1);
  });
});

// ─── Pagination, date windows and the N+1 fix ────────────────────────────

/**
 * Prisma double covering every delegate the reports touch. Deliberately
 * hand-rolled, matching the style of the other *.service.spec.ts files.
 */
function makeFullService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    order: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    sellerEarning: { groupBy: jest.fn().mockResolvedValue([]) },
    payout: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    ...overrides,
  };
  return { service: new ReportsService(prisma as never), prisma };
}

describe('ReportsService pagination contract', () => {
  it('returns the { data, pagination } envelope used by every other admin list', async () => {
    const { service, prisma } = makeFullService();
    (prisma.order.count as jest.Mock).mockResolvedValue(137);

    const res = await service.getSalesReport({ page: 2, limit: 50 });

    expect(res).toEqual({
      data: [],
      pagination: { page: 2, limit: 50, total: 137, totalPages: 3 },
    });
  });

  it('translates page/limit into skip/take', async () => {
    const { service, prisma } = makeFullService();
    await service.getSalesReport({ page: 3, limit: 20 });
    const arg = (prisma.order.findMany as jest.Mock).mock.calls[0][0];
    expect(arg.skip).toBe(40);
    expect(arg.take).toBe(20);
  });

  it('defaults to page 1 with the default limit', async () => {
    const { service, prisma } = makeFullService();
    const res = await service.getSalesReport({});
    const arg = (prisma.order.findMany as jest.Mock).mock.calls[0][0];
    expect(arg.skip).toBe(0);
    expect(arg.take).toBe(50);
    expect(res.pagination.page).toBe(1);
  });

  it('clamps an out-of-range limit rather than trusting its caller', async () => {
    const { service, prisma } = makeFullService();
    await service.getSalesReport({ limit: 100000 });
    expect((prisma.order.findMany as jest.Mock).mock.calls[0][0].take).toBe(200);
  });

  it('reports zero pages for an empty result set', async () => {
    const { service } = makeFullService();
    const res = await service.getPayoutsReport({});
    expect(res.pagination).toEqual({
      page: 1,
      limit: 50,
      total: 0,
      totalPages: 0,
    });
  });

  it('counts with the same where clause it queries with', async () => {
    const { service, prisma } = makeFullService();
    await service.getSalesReport({ sellerId: 'seller-1' });
    const findWhere = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    const countWhere = (prisma.order.count as jest.Mock).mock.calls[0][0].where;
    expect(countWhere).toEqual(findWhere);
  });
});

describe('ReportsService date windows', () => {
  it('filters the order ledger on createdAt with a half-open CAT window', async () => {
    const { service, prisma } = makeFullService();
    await service.getSalesReport({
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    });
    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.createdAt).toEqual({
      gte: new Date('2026-05-31T22:00:00.000Z'),
      lt: new Date('2026-06-30T22:00:00.000Z'),
    });
    // The old helper produced an inclusive `lte` ending at 23:59:59.999 local.
    expect(where.createdAt.lte).toBeUndefined();
  });

  it('omits the date filter entirely when no bound is given', async () => {
    const { service, prisma } = makeFullService();
    await service.getSalesReport({});
    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.createdAt).toBeUndefined();
    expect(where.deletedAt).toBeNull();
  });

  it('windows payouts on the payout createdAt, not the order', async () => {
    const { service, prisma } = makeFullService();
    await service.getPayoutsReport({ dateFrom: '2026-06-01' });
    const where = (prisma.payout.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.createdAt.gte).toEqual(new Date('2026-05-31T22:00:00.000Z'));
  });
});

describe('ReportsService.getSellerPerformanceReport', () => {
  const sellers = Array.from({ length: 50 }, (_, i) => ({
    id: `seller-${i}`,
    firstName: 'Vendeur',
    lastName: String(i),
    sellerProfile: {
      id: `profile-${i}`,
      businessName: `Boutique ${i}`,
      avgRating: 4.5,
      totalReviews: 3,
    },
  }));

  // The regression this rewrite exists for: the previous implementation issued
  // three order.count calls plus one sellerEarning.aggregate PER SELLER, inside
  // a Promise.all over an unbounded seller list.
  it('issues a fixed number of queries regardless of seller count', async () => {
    const { service, prisma } = makeFullService();
    (prisma.user.findMany as jest.Mock).mockResolvedValue(sellers);
    (prisma.user.count as jest.Mock).mockResolvedValue(50);

    await service.getSellerPerformanceReport({ limit: 200 });

    expect((prisma.user.findMany as jest.Mock).mock.calls).toHaveLength(1);
    expect((prisma.user.count as jest.Mock).mock.calls).toHaveLength(1);
    expect((prisma.order.groupBy as jest.Mock).mock.calls).toHaveLength(1);
    expect((prisma.sellerEarning.groupBy as jest.Mock).mock.calls).toHaveLength(1);
    // The delegate the old N+1 leaned on must not be touched at all.
    expect((prisma.order.count as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('derives total / delivered / cancelled from one grouped query', async () => {
    const { service, prisma } = makeFullService();
    (prisma.user.findMany as jest.Mock).mockResolvedValue([sellers[0]]);
    (prisma.user.count as jest.Mock).mockResolvedValue(1);
    (prisma.order.groupBy as jest.Mock).mockResolvedValue([
      { sellerId: 'seller-0', status: 'DELIVERED', _count: { _all: 7 } },
      { sellerId: 'seller-0', status: 'CANCELLED', _count: { _all: 2 } },
      { sellerId: 'seller-0', status: 'PENDING', _count: { _all: 1 } },
    ]);
    (prisma.sellerEarning.groupBy as jest.Mock).mockResolvedValue([
      {
        sellerProfileId: 'profile-0',
        _sum: { grossAmountCDF: BigInt(900000), commissionCDF: BigInt(90000) },
      },
    ]);

    const res = await service.getSellerPerformanceReport({});

    expect(res.data[0]).toMatchObject({
      businessName: 'Boutique 0',
      totalOrders: 10,
      deliveredOrders: 7,
      cancelledOrders: 2,
      totalRevenueCDF: '900000',
      totalCommissionCDF: '90000',
    });
  });

  it('reports zeros for a seller with no orders in the window', async () => {
    const { service, prisma } = makeFullService();
    (prisma.user.findMany as jest.Mock).mockResolvedValue([sellers[0]]);
    (prisma.user.count as jest.Mock).mockResolvedValue(1);

    const res = await service.getSellerPerformanceReport({});

    expect(res.data[0]).toMatchObject({
      totalOrders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0,
      totalRevenueCDF: '0',
      totalCommissionCDF: '0',
    });
  });

  it('skips the aggregate queries entirely when the page is empty', async () => {
    const { service, prisma } = makeFullService();
    const res = await service.getSellerPerformanceReport({});
    expect(res.data).toEqual([]);
    expect((prisma.order.groupBy as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('orders sellers deterministically so pages cannot repeat or skip rows', async () => {
    const { service, prisma } = makeFullService();
    await service.getSellerPerformanceReport({});
    const arg = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('scopes to a single seller by id', async () => {
    const { service, prisma } = makeFullService();
    await service.getSellerPerformanceReport({ sellerId: 'seller-7' });
    const where = (prisma.user.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 'seller-7', role: 'SELLER', deletedAt: null });
  });
});

describe('ReportsService CSV exports are not paginated', () => {
  it('pulls the whole filtered set, capped by CSV_MAX_ROWS', async () => {
    const { service, prisma } = makeFullService();
    const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn() };

    await service.generateSalesCsv({ page: 3, limit: 10 }, res as never);

    const arg = (prisma.order.findMany as jest.Mock).mock.calls[0][0];
    expect(arg.skip).toBe(0);
    expect(arg.take).toBe(50_001);
  });
});
