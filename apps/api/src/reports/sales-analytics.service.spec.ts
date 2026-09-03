import { SalesAnalyticsService } from './sales-analytics.service';

/**
 * Unit coverage for the sale predicate, the dimension SQL and the category
 * roll-up. Hand-rolled Prisma mock, matching the other *.service.spec.ts files.
 *
 * End-to-end numeric correctness of every dimension was proven separately
 * against an independent JS oracle over rich fixtures inside a rolled-back
 * transaction (see docs/search-sales-analytics.md). These tests pin the
 * SEMANTICS that diff could not express: which statuses count, which column is
 * the time axis, and when the window is applied at all.
 */
function makeService(rows: unknown[][] = []) {
  const queue = [...rows];
  const $queryRaw = jest
    .fn()
    .mockImplementation(() => Promise.resolve(queue.length > 0 ? queue.shift() : []));
  const prisma = {
    $queryRaw,
    category: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { service: new SalesAnalyticsService(prisma as never), prisma, $queryRaw };
}

/** The SQL of the Nth $queryRaw call, flattened. */
function sqlOf(mock: jest.Mock, call = 0): string {
  const arg = mock.mock.calls[call][0] as { strings?: string[]; sql?: string };
  return (arg.strings ? arg.strings.join(' ') : (arg.sql ?? '')).replace(/\s+/g, ' ');
}

function paramsOf(mock: jest.Mock, call = 0): unknown[] {
  const arg = mock.mock.calls[call][0] as { values?: unknown[] };
  return arg.values ?? [];
}

describe('SalesAnalyticsService — what counts as a sale', () => {
  it('counts only DELIVERED, non-soft-deleted orders', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'product' });
    const sql = sqlOf($queryRaw);
    expect(sql).toContain(`"status" = 'DELIVERED'`);
    expect(sql).toContain(`"deletedAt" IS NULL`);
  });

  // RETURNED needs no clause of its own: approveReturn() moves the order OFF
  // DELIVERED, so the status predicate already excludes it. This exists so
  // nobody adds a redundant NOT IN and then wonders why.
  it('does not need an explicit RETURNED or CANCELLED exclusion', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'seller' });
    const sql = sqlOf($queryRaw);
    expect(sql).not.toContain('RETURNED');
    expect(sql).not.toContain('CANCELLED');
  });

  it('uses deliveredAt as the time axis, never createdAt', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'product', dateFrom: '2026-06-01', dateTo: '2026-06-30' });
    const sql = sqlOf($queryRaw);
    expect(sql).toContain('"deliveredAt" >=');
    expect(sql).toContain('"deliveredAt" <');
    expect(sql).not.toContain('"createdAt"');
  });

  it('anchors the window to Africa/Lubumbashi, not UTC', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'product', dateFrom: '2026-06-01', dateTo: '2026-06-30' });
    const params = paramsOf($queryRaw) as Date[];
    // 2026-06-01T00:00 CAT === 2026-05-31T22:00Z; dateTo is inclusive, so the
    // exclusive upper bound is 2026-07-01T00:00 CAT === 2026-06-30T22:00Z.
    expect(params.some((v) => v instanceof Date && v.toISOString() === '2026-05-31T22:00:00.000Z')).toBe(true);
    expect(params.some((v) => v instanceof Date && v.toISOString() === '2026-06-30T22:00:00.000Z')).toBe(true);
  });

  // Conditional, not unconditional: forceStatusChange() writes only { status }
  // and prisma/seed.ts never sets deliveredAt, so DELIVERED rows with a NULL
  // deliveredAt genuinely exist — both dev delivered orders are exactly that.
  it('omits the deliveredAt bounds entirely when no date is supplied', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'product' });
    expect(sqlOf($queryRaw)).not.toContain('"deliveredAt" >=');
  });

  it('scopes to a single seller when asked', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'town', sellerId: 'seller-1' });
    expect(sqlOf($queryRaw)).toContain('"sellerId"::text =');
    expect(paramsOf($queryRaw)).toContain('seller-1');
  });
});

describe('SalesAnalyticsService — measures', () => {
  it('sums the CHARGED item total, so revenue is already net of discount', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'product' });
    const sql = sqlOf($queryRaw);
    expect(sql).toContain('SUM(oi."totalCDF")');
    // Delivery fee is an order-level charge that cannot be attributed to a
    // product or category, so it is deliberately excluded from revenue.
    expect(sql).not.toContain('deliveryFeeCDF');
  });

  it('reconstructs the buyer saving from the list-price snapshot', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'product' });
    const sql = sqlOf($queryRaw);
    expect(sql).toContain('"listUnitPriceCDF" IS NOT NULL');
    expect(sql).toContain('"listUnitPriceCDF" - oi."unitPriceCDF"');
  });

  it('counts distinct orders, so a multi-item order counts once', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'seller' });
    expect(sqlOf($queryRaw)).toContain('COUNT(DISTINCT o."id")');
  });
});

describe('SalesAnalyticsService — dimensions', () => {
  it('labels products from the ORDER-ITEM snapshot, not the live product row', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'product' });
    const sql = sqlOf($queryRaw);
    expect(sql).toContain('MAX(oi."productTitle")');
  });

  it('reads the town from the order SNAPSHOT, with the relation only as fallback', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'town' });
    const sql = sqlOf($queryRaw);
    // Never a plain join to addresses: a buyer edits their single address, and
    // reading through it would retroactively rewrite past orders' towns.
    expect(sql).toContain('COALESCE(o."deliveryTown", a."town")');
    expect(sql).toContain('LEFT JOIN "addresses"');
  });

  it('folds town case and accents into one group but keeps a readable label', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'town' });
    const sql = sqlOf($queryRaw);
    expect(sql).toContain('public.f_unaccent(LOWER(COALESCE');
    expect(sql).toContain('MAX(COALESCE(o."deliveryTown"');
  });

  it('buckets days in Africa/Lubumbashi', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'day' });
    expect(sqlOf($queryRaw)).toContain(`AT TIME ZONE 'Africa/Lubumbashi'`);
  });

  it('excludes undated orders from day buckets, which cannot bucket them', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'day' });
    expect(sqlOf($queryRaw)).toContain('"deliveredAt" IS NOT NULL');
  });

  it('defaults to the day dimension', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({});
    expect(sqlOf($queryRaw)).toContain('AT TIME ZONE');
  });
});

describe('SalesAnalyticsService — category roll-up', () => {
  const leaf = (id: string, revenue: string) => ({
    key: id, label: null, orders: 1, units: 2, revenue, discount: '0',
  });

  it('rolls leaf categories up to their root and merges the measures', async () => {
    const { service, prisma } = makeService([[leaf('leaf-a', '1000'), leaf('leaf-b', '500')]]);
    (prisma.category.findMany as jest.Mock).mockResolvedValue([
      { id: 'root', name: 'Mode', parentCategoryId: null },
      { id: 'mid', name: 'Homme', parentCategoryId: 'root' },
      { id: 'leaf-a', name: 'Chemises', parentCategoryId: 'mid' },
      { id: 'leaf-b', name: 'Pantalons', parentCategoryId: 'mid' },
    ]);

    const res = await service.getBreakdown({ by: 'category' });

    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      key: 'root', label: 'Mode', units: 4, revenueCDF: '1500',
    });
  });

  it('keeps distinct roots apart', async () => {
    const { service, prisma } = makeService([[leaf('leaf-a', '1000'), leaf('leaf-c', '400')]]);
    (prisma.category.findMany as jest.Mock).mockResolvedValue([
      { id: 'r1', name: 'Mode', parentCategoryId: null },
      { id: 'leaf-a', name: 'Chemises', parentCategoryId: 'r1' },
      { id: 'r2', name: 'Électronique', parentCategoryId: null },
      { id: 'leaf-c', name: 'Moniteurs', parentCategoryId: 'r2' },
    ]);
    const res = await service.getBreakdown({ by: 'category' });
    expect(res.data.map((r) => r.label).sort()).toEqual(['Mode', 'Électronique']);
  });

  it('survives an orphaned parent chain instead of looping forever', async () => {
    const { service, prisma } = makeService([[leaf('orphan', '10')]]);
    (prisma.category.findMany as jest.Mock).mockResolvedValue([
      { id: 'orphan', name: 'Orpheline', parentCategoryId: 'missing-parent' },
    ]);
    const res = await service.getBreakdown({ by: 'category' });
    expect(res.data[0].label).toBe('Orpheline');
  });

  it('skips the category lookup entirely when nothing sold', async () => {
    const { service, prisma } = makeService([[]]);
    const res = await service.getBreakdown({ by: 'category' });
    expect(res.data).toEqual([]);
    expect((prisma.category.findMany as jest.Mock).mock.calls).toHaveLength(0);
  });
});

describe('SalesAnalyticsService — pagination and bounds', () => {
  it('pages SQL-side dimensions with LIMIT/OFFSET', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'product', page: 3, limit: 10 });
    const params = paramsOf($queryRaw);
    expect(params).toContain(10);
    expect(params).toContain(20);
  });

  it('clamps an over-large limit', async () => {
    const { service, $queryRaw } = makeService();
    await service.getBreakdown({ by: 'product', limit: 99999 });
    expect(paramsOf($queryRaw)).toContain(200);
  });

  it('returns the standard pagination envelope', async () => {
    const { service } = makeService([[], [{ n: 0 }]]);
    const res = await service.getBreakdown({ by: 'product' });
    expect(res.pagination).toEqual({ page: 1, limit: 50, total: 0, totalPages: 0 });
  });

  it('never issues a per-row follow-up query (no N+1)', async () => {
    const { service, $queryRaw, prisma } = makeService([
      [
        { key: 'p1', label: 'A', orders: 1, units: 1, revenue: '10', discount: '0' },
        { key: 'p2', label: 'B', orders: 1, units: 1, revenue: '20', discount: '0' },
        { key: 'p3', label: 'C', orders: 1, units: 1, revenue: '30', discount: '0' },
      ],
      [{ n: 3 }],
    ]);
    await service.getBreakdown({ by: 'product' });
    // Exactly two: the page and its count. Never one per row.
    expect($queryRaw.mock.calls).toHaveLength(2);
    expect((prisma.category.findMany as jest.Mock).mock.calls).toHaveLength(0);
  });
});

describe('SalesAnalyticsService.getSummary', () => {
  it('reports returned and cancelled separately from completed sales', async () => {
    const { service } = makeService([
      [{ key: null, label: null, orders: 5, units: 9, revenue: '900', discount: '50' }],
      [{ n: 2 }], [{ n: 1 }], [{ n: 3 }],
    ]);
    const s = await service.getSummary({});
    expect(s).toMatchObject({
      completedOrders: 5, unitsSold: 9, revenueCDF: '900', discountCDF: '50',
      deliveredWithoutDate: 2, returnedOrders: 1, cancelledOrders: 3, windowApplied: false,
    });
  });

  // The counter that keeps a windowed report honest: these orders ARE delivered
  // but carry no deliveredAt, so no windowed query can ever see them.
  it('flags delivered orders that carry no deliveredAt', async () => {
    const { service, $queryRaw } = makeService([
      [{ key: null, label: null, orders: 0, units: 0, revenue: '0', discount: '0' }],
      [{ n: 7 }], [{ n: 0 }], [{ n: 0 }],
    ]);
    const s = await service.getSummary({ dateFrom: '2026-06-01' });
    expect(s.deliveredWithoutDate).toBe(7);
    expect(s.windowApplied).toBe(true);
    // The gap counter must NOT be narrowed by the window it reports on.
    expect(sqlOf($queryRaw, 1)).toContain('"deliveredAt" IS NULL');
  });

  it('counts cancellations on createdAt — a cancelled order has no delivery date', async () => {
    const { service, $queryRaw } = makeService([
      [{ key: null, label: null, orders: 0, units: 0, revenue: '0', discount: '0' }],
      [{ n: 0 }], [{ n: 0 }], [{ n: 0 }],
    ]);
    await service.getSummary({ dateFrom: '2026-06-01', dateTo: '2026-06-30' });
    expect(sqlOf($queryRaw, 3)).toContain('"createdAt" >=');
  });
});
