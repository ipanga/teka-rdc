import { Decimal } from '@prisma/client/runtime/library';
import { EarningsService } from './earnings.service';

// EarningsService only depends on PrismaService → mock it directly.
function makeService(overrides?: {
  existingEarning?: unknown;
  order?: unknown;
  categorySetting?: unknown;
  globalSetting?: unknown;
}) {
  const tx = {
    sellerEarning: { create: jest.fn().mockResolvedValue({}) },
    sellerProfile: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    sellerEarning: {
      findUnique: jest.fn().mockResolvedValue(overrides?.existingEarning ?? null),
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: {} }),
    },
    order: {
      findUnique: jest.fn().mockResolvedValue(overrides?.order ?? null),
    },
    commissionSetting: {
      findUnique: jest.fn().mockResolvedValue(overrides?.categorySetting ?? null),
      findFirst: jest.fn().mockResolvedValue(overrides?.globalSetting ?? null),
    },
    sellerProfile: { update: jest.fn() },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const service = new EarningsService(prisma as never);
  return { service, prisma, tx };
}

const orderFor = (subtotalCDF: bigint, categoryId: string | null = null) => ({
  id: 'o1',
  sellerId: 's1',
  subtotalCDF,
  items: [{ product: { categoryId } }],
  seller: { sellerProfile: { id: 'sp1' } },
});

describe('EarningsService.createEarning', () => {
  it('computes commission on the subtotal (excl. delivery) at the 10% default (no immediate wallet credit — lazy model)', async () => {
    // 1.000.000 centimes subtotal, no category → default 10%.
    const { service, prisma } = makeService({ order: orderFor(1000000n) });
    await service.createEarning('o1');

    expect(prisma.sellerEarning.create).toHaveBeenCalledTimes(1);
    const data = (prisma.sellerEarning.create as jest.Mock).mock.calls[0][0].data;
    expect(data.grossAmountCDF).toBe(1000000n);
    expect(data.commissionCDF).toBe(100000n); // round(1.000.000 * 0.10)
    expect(data.netAmountCDF).toBe(900000n);
    expect((data.commissionRate as Decimal).toString()).toBe('0.1');

    // Lazy model: the wallet is NOT credited at delivery — availability is
    // computed from window-cleared earnings on read.
    expect(prisma.sellerProfile.update).not.toHaveBeenCalled();
  });

  it('rounds the commission (banker-free Math.round)', async () => {
    // 333.333 centimes * 0.10 = 33333.3 → round → 33333.
    const { service, prisma } = makeService({ order: orderFor(333333n) });
    await service.createEarning('o1');
    const data = (prisma.sellerEarning.create as jest.Mock).mock.calls[0][0].data;
    expect(data.commissionCDF).toBe(33333n);
    expect(data.netAmountCDF).toBe(300000n);
  });

  it('uses a category-specific commission rate when configured', async () => {
    const { service, prisma } = makeService({
      order: orderFor(1000000n, 'cat-1'),
      categorySetting: { rate: new Decimal('0.1500') }, // 15%
    });
    await service.createEarning('o1');
    const data = (prisma.sellerEarning.create as jest.Mock).mock.calls[0][0].data;
    expect(data.commissionCDF).toBe(150000n);
    expect(data.netAmountCDF).toBe(850000n);
  });

  it('is idempotent — skips when an earning already exists for the order', async () => {
    const { service, prisma } = makeService({
      existingEarning: { id: 'e1' },
      order: orderFor(1000000n),
    });
    await service.createEarning('o1');
    expect(prisma.sellerEarning.create).not.toHaveBeenCalled();
  });
});

describe('EarningsService return-window eligibility', () => {
  it('getEligibleEarnings only selects window-cleared, non-returned, unpaid earnings', async () => {
    const { service, prisma } = makeService();
    await service.getEligibleEarnings('sp1');
    const where = (prisma.sellerEarning.findMany as jest.Mock).mock.calls[0][0]
      .where;
    expect(where.sellerProfileId).toBe('sp1');
    expect(where.isPaid).toBe(false);
    expect(where.payoutId).toBeNull();
    expect(where.order.status).toEqual({ not: 'RETURNED' });
    // Delivered at or before (now - 2 days) → window cleared.
    expect(where.order.deliveredAt.lte).toBeInstanceOf(Date);
  });

  it('getBalances splits available (cleared) vs pending (in-window)', async () => {
    const { service, prisma } = makeService();
    (prisma.sellerEarning.aggregate as jest.Mock)
      .mockResolvedValueOnce({ _sum: { netAmountCDF: 900000n } }) // available
      .mockResolvedValueOnce({ _sum: { netAmountCDF: 300000n } }) // pending
      .mockResolvedValueOnce({
        _sum: { grossAmountCDF: 2000000n, commissionCDF: 200000n },
      });
    const b = await service.getBalances('sp1');
    expect(b.availableCDF).toBe(900000n);
    expect(b.pendingCDF).toBe(300000n);
    expect(b.totalEarnedCDF).toBe(2000000n);

    // The pending aggregate uses deliveredAt > cutoff (still inside window).
    const pendingWhere = (prisma.sellerEarning.aggregate as jest.Mock).mock
      .calls[1][0].where;
    expect(pendingWhere.order.deliveredAt.gt).toBeInstanceOf(Date);
  });
});

describe('EarningsService.computeBreakdown (seller "à recevoir" preview)', () => {
  it('projects gross/commission/net at the default rate (no category)', async () => {
    const { service } = makeService();
    const b = await service.computeBreakdown(1000000n, null);
    expect(b.grossAmountCDF).toBe(1000000n);
    expect(b.commissionCDF).toBe(100000n); // 10%
    expect(b.netAmountCDF).toBe(900000n);
    expect(b.commissionRate.toString()).toBe('0.1');
  });

  it('uses the category rate when present', async () => {
    const { service } = makeService({ categorySetting: { rate: new Decimal('0.2000') } });
    const b = await service.computeBreakdown(1000000n, 'cat-1');
    expect(b.commissionCDF).toBe(200000n);
    expect(b.netAmountCDF).toBe(800000n);
  });
});
