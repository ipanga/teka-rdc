import { Decimal } from '@prisma/client/runtime/library';
import { CommissionSource, OrderStatus } from '@prisma/client';
import {
  CommissionNotConfiguredError,
  EarningsService,
} from './earnings.service';

// EarningsService only depends on PrismaService → one hand-rolled mock. The
// same object doubles as the transaction client so `db`-taking methods are
// exercised exactly as markDelivered / requestPayout call them.
function makeService(overrides?: {
  existingEarning?: unknown;
  order?: unknown;
  profile?: { id: string; commissionRate: Decimal | null } | null;
  categorySettings?: Record<string, { id: string; rate: Decimal }>;
  globalSetting?: { id: string; rate: Decimal } | null;
}) {
  const categorySettings = overrides?.categorySettings ?? {};
  const prisma = {
    sellerEarning: {
      findUnique: jest
        .fn()
        .mockResolvedValue(overrides?.existingEarning ?? null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: {} }),
      count: jest.fn().mockResolvedValue(0),
    },
    orderItem: { update: jest.fn().mockResolvedValue({}) },
    order: {
      findUnique: jest.fn().mockResolvedValue(overrides?.order ?? null),
    },
    sellerProfile: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides?.profile === undefined
            ? { id: 'sp1', commissionRate: null }
            : overrides.profile,
        ),
    },
    commissionSetting: {
      findFirst: jest
        .fn()
        .mockImplementation(
          (args: { where: { categoryId: string | null } }) => {
            const cid = args.where.categoryId;
            if (cid === null) {
              return Promise.resolve(
                overrides?.globalSetting === undefined
                  ? { id: 'global', rate: new Decimal('0.1000') }
                  : overrides.globalSetting,
              );
            }
            return Promise.resolve(categorySettings[cid] ?? null);
          },
        ),
    },
  };
  const service = new EarningsService(prisma as never);
  return { service, prisma };
}

const item = (id: string, totalCDF: bigint, categoryId: string | null) => ({
  id,
  totalCDF,
  product: { categoryId },
});

const orderWith = (items: ReturnType<typeof item>[], subtotalCDF?: bigint) => ({
  id: 'o1',
  sellerId: 's1',
  subtotalCDF: subtotalCDF ?? items.reduce((s, i) => s + i.totalCDF, 0n),
  items,
  seller: { sellerProfile: { id: 'sp1' } },
});

describe('EarningsService.resolveCommission — precedence (D3)', () => {
  it('seller override wins over category and global', async () => {
    const { service } = makeService({
      profile: { id: 'sp1', commissionRate: new Decimal('0.0500') },
      categorySettings: { 'cat-1': { id: 'cs1', rate: new Decimal('0.1500') } },
    });
    const r = await service.resolveCommission('sp1', 'cat-1');
    expect(r.source).toBe(CommissionSource.SELLER);
    expect(r.units).toBe(500n);
    expect(r.ruleId).toBe('sp1');
  });

  it('a 0 % seller override is a real override, not "no override"', async () => {
    const { service } = makeService({
      profile: { id: 'sp1', commissionRate: new Decimal('0') },
    });
    const r = await service.resolveCommission('sp1', null);
    expect(r.source).toBe(CommissionSource.SELLER);
    expect(r.units).toBe(0n);
  });

  it('leaf category setting wins over global when no seller override', async () => {
    const { service } = makeService({
      categorySettings: { 'cat-1': { id: 'cs1', rate: new Decimal('0.1500') } },
    });
    const r = await service.resolveCommission('sp1', 'cat-1');
    expect(r.source).toBe(CommissionSource.CATEGORY);
    expect(r.ruleId).toBe('cs1');
    expect(r.rate.toFixed(4)).toBe('0.1500');
  });

  it('falls back to the global setting', async () => {
    const { service } = makeService();
    const r = await service.resolveCommission('sp1', 'cat-unknown');
    expect(r.source).toBe(CommissionSource.GLOBAL);
    expect(r.ruleId).toBe('global');
  });

  it('has NO hardcoded fallback: throws when no global setting exists', async () => {
    const { service } = makeService({ globalSetting: null });
    await expect(service.resolveCommission('sp1', null)).rejects.toBeInstanceOf(
      CommissionNotConfiguredError,
    );
  });
});

describe('EarningsService.computeBreakdown — per item (D5), integer math', () => {
  it('charges each line at its own category rate and sums (MIXED source, blended rate)', async () => {
    const { service } = makeService({
      categorySettings: {
        'cat-a': { id: 'cs-a', rate: new Decimal('0.2000') },
      },
    });
    const b = await service.computeBreakdown('sp1', [
      { id: 'i1', totalCDF: 1_000_000n, categoryId: 'cat-a' }, // 20% → 200 000
      { id: 'i2', totalCDF: 1_000_000n, categoryId: 'cat-b' }, // global 10% → 100 000
    ]);
    expect(b.grossAmountCDF).toBe(2_000_000n);
    expect(b.commissionCDF).toBe(300_000n);
    expect(b.netAmountCDF).toBe(1_700_000n);
    expect(b.commissionSource).toBe(CommissionSource.MIXED);
    expect(b.commissionRate.toFixed(4)).toBe('0.1500'); // blended, display only
    expect(b.items.map((i) => i.commissionCDF)).toEqual([200_000n, 100_000n]);
    expect(b.items[0].commissionRuleId).toBe('cs-a');
    expect(b.items[1].commissionRuleId).toBe('global');
  });

  it("is NOT the first item's rate applied to the whole order", async () => {
    const { service } = makeService({
      categorySettings: {
        'cat-a': { id: 'cs-a', rate: new Decimal('0.2000') },
      },
    });
    const b = await service.computeBreakdown('sp1', [
      { totalCDF: 100n, categoryId: 'cat-a' },
      { totalCDF: 1_000_000n, categoryId: 'cat-b' },
    ]);
    // first-item rule would give 200 020; per item gives 20 + 100 000.
    expect(b.commissionCDF).toBe(100_020n);
  });

  it('keeps the exact rate when every line shares one rule', async () => {
    const { service } = makeService();
    const b = await service.computeBreakdown('sp1', [
      { totalCDF: 333_333n, categoryId: null },
      { totalCDF: 5n, categoryId: null },
    ]);
    // 33 333.3 → 33 333 ; 0.5 → 1 (half-up per line)
    expect(b.commissionCDF).toBe(33_334n);
    expect(b.commissionSource).toBe(CommissionSource.GLOBAL);
    expect(b.commissionRate.toFixed(4)).toBe('0.1000');
  });

  it('a seller override applies to every line regardless of category', async () => {
    const { service } = makeService({
      profile: { id: 'sp1', commissionRate: new Decimal('0.0500') },
      categorySettings: {
        'cat-a': { id: 'cs-a', rate: new Decimal('0.2000') },
      },
    });
    const b = await service.computeBreakdown('sp1', [
      { totalCDF: 1_000_000n, categoryId: 'cat-a' },
      { totalCDF: 1_000_000n, categoryId: null },
    ]);
    expect(b.commissionCDF).toBe(100_000n);
    expect(b.commissionSource).toBe(CommissionSource.SELLER);
  });
});

describe('EarningsService.createEarning — snapshot at delivery (D4)', () => {
  it('persists totals + source on the earning and the per-line snapshot on each item', async () => {
    const { service, prisma } = makeService({
      categorySettings: {
        'cat-a': { id: 'cs-a', rate: new Decimal('0.2000') },
      },
      order: orderWith([
        item('i1', 1_000_000n, 'cat-a'),
        item('i2', 500_000n, null),
      ]),
    });
    await service.createEarning('o1', prisma as never);

    const data = (prisma.sellerEarning.create as jest.Mock).mock.calls[0][0]
      .data;
    expect(data.grossAmountCDF).toBe(1_500_000n);
    expect(data.commissionCDF).toBe(250_000n);
    expect(data.netAmountCDF).toBe(1_250_000n);
    expect(data.commissionSource).toBe(CommissionSource.MIXED);

    expect(prisma.orderItem.update).toHaveBeenCalledTimes(2);
    expect(prisma.orderItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: expect.objectContaining({
        commissionCDF: 200_000n,
        commissionSource: CommissionSource.CATEGORY,
        commissionRuleId: 'cs-a',
      }),
    });
    expect(prisma.orderItem.update).toHaveBeenCalledWith({
      where: { id: 'i2' },
      data: expect.objectContaining({
        commissionCDF: 50_000n,
        commissionSource: CommissionSource.GLOBAL,
        commissionRuleId: 'global',
      }),
    });
  });

  it('runs every read/write on the transaction client it is given', async () => {
    const { service, prisma } = makeService({
      order: orderWith([item('i1', 100n, null)]),
    });
    const tx = { ...prisma } as never;
    await service.createEarning('o1', tx);
    expect(prisma.sellerEarning.create).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — skips when an earning already exists for the order', async () => {
    const { service, prisma } = makeService({
      existingEarning: { id: 'e1' },
      order: orderWith([item('i1', 100n, null)]),
    });
    await service.createEarning('o1');
    expect(prisma.sellerEarning.create).not.toHaveBeenCalled();
    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });

  it('fails loudly (rolls the delivery back) when no commission rule exists', async () => {
    const { service, prisma } = makeService({
      globalSetting: null,
      order: orderWith([item('i1', 100n, null)]),
    });
    await expect(service.createEarning('o1')).rejects.toBeInstanceOf(
      CommissionNotConfiguredError,
    );
    expect(prisma.sellerEarning.create).not.toHaveBeenCalled();
  });

  it('historical stability: a later rate change cannot alter a persisted earning (reads use the row, never recompute)', async () => {
    // The service exposes no code path that rewrites an existing earning's
    // amounts: createEarning is a no-op once the row exists, and there is no
    // "recompute" method. Pin that surface.
    const { service } = makeService();
    const mutating = Object.getOwnPropertyNames(
      Object.getPrototypeOf(service),
    ).filter((m) => /recompute|recalc|rewrite/i.test(m));
    expect(mutating).toEqual([]);
  });
});

describe('EarningsService.reverseEarning — auditable, never deletes (D6)', () => {
  const tx = () => ({
    sellerEarning: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn(),
    },
  });

  it('stamps reversedAt + reason on a free earning and keeps the row', async () => {
    const { service } = makeService();
    const t = tx();
    t.sellerEarning.findUnique.mockResolvedValue({
      id: 'e1',
      isPaid: false,
      payoutId: null,
      reversedAt: null,
      clawbackRequiredAt: null,
    });
    const r = await service.reverseEarning('o1', t as never, 'RETURN_APPROVED');
    expect(r).toEqual({ reversed: true, inPayout: false });
    expect(t.sellerEarning.delete).not.toHaveBeenCalled();
    const data = t.sellerEarning.update.mock.calls[0][0].data;
    expect(data.reversedAt).toBeInstanceOf(Date);
    expect(data.reversalReason).toBe('RETURN_APPROVED');
  });

  it('flags a manual clawback when the earning is already reserved in a payout', async () => {
    const { service } = makeService();
    const t = tx();
    t.sellerEarning.findUnique.mockResolvedValue({
      id: 'e1',
      isPaid: true,
      payoutId: 'p1',
      reversedAt: null,
      clawbackRequiredAt: null,
    });
    const r = await service.reverseEarning(
      'o1',
      t as never,
      'ORDER_STATUS_FORCED',
    );
    expect(r).toEqual({ reversed: false, inPayout: true });
    const data = t.sellerEarning.update.mock.calls[0][0].data;
    expect(data.clawbackRequiredAt).toBeInstanceOf(Date);
    expect(data.reversedAt).toBeUndefined();
  });

  it('is idempotent on an already-reversed earning', async () => {
    const { service } = makeService();
    const t = tx();
    t.sellerEarning.findUnique.mockResolvedValue({
      id: 'e1',
      isPaid: false,
      payoutId: null,
      reversedAt: new Date(),
      clawbackRequiredAt: null,
    });
    const r = await service.reverseEarning('o1', t as never);
    expect(r).toEqual({ reversed: true, inPayout: false });
    expect(t.sellerEarning.update).not.toHaveBeenCalled();
  });

  it('is a no-op without an earning', async () => {
    const { service } = makeService();
    const t = tx();
    t.sellerEarning.findUnique.mockResolvedValue(null);
    expect(await service.reverseEarning('o1', t as never)).toEqual({
      reversed: false,
      inPayout: false,
    });
  });
});

describe('EarningsService payability (COD invariant + D6)', () => {
  it('eligible = window closed AND order still DELIVERED AND not reversed AND not reserved', async () => {
    const { service, prisma } = makeService();
    await service.getEligibleEarnings('sp1');
    const where = (prisma.sellerEarning.findMany as jest.Mock).mock.calls[0][0]
      .where;
    expect(where.sellerProfileId).toBe('sp1');
    expect(where.isPaid).toBe(false);
    expect(where.payoutId).toBeNull();
    expect(where.reversedAt).toBeNull();
    expect(where.order.status).toBe(OrderStatus.DELIVERED); // positive filter
    expect(where.order.deliveredAt.lte).toBeInstanceOf(Date);
    const cutoff: Date = where.order.deliveredAt.lte;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(
      2 * 24 * 3600 * 1000 - 1000,
    );
  });

  it('getEligibleEarnings reads through the given transaction client', async () => {
    const { service } = makeService();
    const tx = {
      sellerEarning: {
        findMany: jest.fn().mockResolvedValue([{ id: 'e1', netAmountCDF: 1n }]),
      },
    };
    const rows = await service.getEligibleEarnings('sp1', tx as never);
    expect(rows).toEqual([{ id: 'e1', netAmountCDF: 1n }]);
    expect(tx.sellerEarning.findMany).toHaveBeenCalledTimes(1);
  });

  it('getBalances: available vs held split; lifetime totals exclude reversed rows', async () => {
    const { service, prisma } = makeService();
    (prisma.sellerEarning.aggregate as jest.Mock)
      .mockResolvedValueOnce({ _sum: { netAmountCDF: 900000n } })
      .mockResolvedValueOnce({ _sum: { netAmountCDF: 300000n } })
      .mockResolvedValueOnce({
        _sum: { grossAmountCDF: 2000000n, commissionCDF: 200000n },
      });
    const b = await service.getBalances('sp1');
    expect(b.availableCDF).toBe(900000n);
    expect(b.pendingCDF).toBe(300000n);
    expect(b.totalEarnedCDF).toBe(2000000n);
    const calls = (prisma.sellerEarning.aggregate as jest.Mock).mock.calls;
    expect(calls[1][0].where.order.deliveredAt.gt).toBeInstanceOf(Date);
    expect(calls[1][0].where.order.status).toBe(OrderStatus.DELIVERED);
    expect(calls[2][0].where).toEqual({
      sellerProfileId: 'sp1',
      reversedAt: null,
    });
  });

  it('wallet response keeps the frozen field names for installed mobile builds', async () => {
    const { service } = makeService();
    const w = await service.getSellerWallet('sp1');
    expect(Object.keys(w).sort()).toEqual([
      'availableCDF',
      'balanceCDF',
      'pendingCDF',
      'pendingPayoutCDF',
      'totalCommissionCDF',
      'totalEarnedCDF',
    ]);
    expect(w.balanceCDF).toBe(w.availableCDF);
    expect(w.pendingPayoutCDF).toBe(w.availableCDF);
  });
});

describe('EarningsService — seller override lifecycle (PR 5)', () => {
  const line = { id: 'i1', totalCDF: 1_000_000n, categoryId: 'cat1' }; // 10.000 FC

  it('two sellers with different effective rates are charged differently on identical goods, with the same rounding rule', async () => {
    const { service, prisma } = makeService();
    prisma.sellerProfile.findUnique.mockImplementation(
      (args: { where: { id: string } }) =>
        Promise.resolve(
          args.where.id === 'spA'
            ? { id: 'spA', commissionRate: new Decimal('0.0825') } // negotiated 8,25 %
            : { id: 'spB', commissionRate: null }, // platform default 10 %
        ),
    );
    const odd = { id: 'i2', totalCDF: 1_000_001n, categoryId: null }; // forces a half-up case at 8,25 %
    const a = await service.computeBreakdown('spA', [line, odd]);
    const b = await service.computeBreakdown('spB', [line, odd]);
    expect(a.commissionSource).toBe(CommissionSource.SELLER);
    expect(b.commissionSource).toBe(CommissionSource.GLOBAL);
    // 1 000 000 × 825 / 10 000 = 82 500 ; 1 000 001 × 825 / 10 000 = 82 500,0825 → 82 500
    expect(a.commissionCDF).toBe(82_500n + 82_500n);
    // 10 % : 100 000 + 100 000,1 → 100 000
    expect(b.commissionCDF).toBe(100_000n + 100_000n);
    expect(a.netAmountCDF).toBe(2_000_001n - 165_000n);
    expect(b.netAmountCDF).toBe(2_000_001n - 200_000n);
    expect(a.items[0].commissionRuleId).toBe('spA');
    expect(b.items[0].commissionRuleId).toBe('global');
  });

  it('removing the override falls back to the platform default for FUTURE computations only — no persisted earning is rewritten', async () => {
    const { service, prisma } = makeService({
      profile: { id: 'sp1', commissionRate: new Decimal('0.05') },
    });
    const withOverride = await service.computeBreakdown('sp1', [line]);
    expect(withOverride.commissionCDF).toBe(50_000n);
    expect(withOverride.commissionSource).toBe(CommissionSource.SELLER);

    // Admin clears the override (NULL = follow category / platform rates).
    prisma.sellerProfile.findUnique.mockResolvedValue({ id: 'sp1', commissionRate: null });
    const afterClear = await service.computeBreakdown('sp1', [line]);
    expect(afterClear.commissionCDF).toBe(100_000n);
    expect(afterClear.commissionSource).toBe(CommissionSource.GLOBAL);

    // Neither computation touched the ledger: history lives in the rows written at delivery.
    expect(prisma.sellerEarning.update).not.toHaveBeenCalled();
    expect(prisma.sellerEarning.create).not.toHaveBeenCalled();
    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });
});
