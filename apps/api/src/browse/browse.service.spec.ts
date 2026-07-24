import { BrowseService } from './browse.service';

// Minimal Prisma mock — browseProducts builds a where + orderBy then calls
// product.findMany. We assert the ordering, not the data.
function makeService() {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const prisma = { product: { findMany, count } };
  const service = new BrowseService(prisma as never);
  return { service, findMany };
}

interface FindManyArg {
  orderBy: Array<Record<string, string>>;
  where: Record<string, unknown>;
}

describe('BrowseService.browseProducts — brand facet filter (P6a)', () => {
  const B1 = '15000000-0000-0000-0000-000000000003';
  const B2 = '15000000-0000-0000-0000-000000000004';

  it('filters by brandId IN the parsed list', async () => {
    const { service, findMany } = makeService();
    await service.browseProducts({ brandIds: `${B1},${B2}` } as never);
    const { where } = (findMany.mock.calls as unknown as FindManyArg[][])[0][0];
    expect(where.brandId).toEqual({ in: [B1, B2] });
  });

  it('drops non-hex tokens and dedups', async () => {
    const { service, findMany } = makeService();
    await service.browseProducts({ brandIds: `${B1}, not-a-uuid, ${B1}` } as never);
    const { where } = (findMany.mock.calls as unknown as FindManyArg[][])[0][0];
    expect(where.brandId).toEqual({ in: [B1] });
  });

  it('applies no brand filter when the param is absent', async () => {
    const { service, findMany } = makeService();
    await service.browseProducts({} as never);
    const { where } = (findMany.mock.calls as unknown as FindManyArg[][])[0][0];
    expect(where.brandId).toBeUndefined();
  });
});

describe('BrowseService.browseProducts — real-above-demo ranking (P3a)', () => {
  it('orders by isDemo asc first (real merchant products before demo)', async () => {
    const { service, findMany } = makeService();
    await service.browseProducts({} as never);
    const calls = findMany.mock.calls as unknown as FindManyArg[][];
    const { orderBy } = calls[0][0];
    expect(Array.isArray(orderBy)).toBe(true);
    expect(orderBy[0]).toEqual({ isDemo: 'asc' });
  });

  it('keeps the buyer’s chosen sort as the secondary key', async () => {
    const { service, findMany } = makeService();
    await service.browseProducts({ sortBy: 'price_low' } as never);
    const calls = findMany.mock.calls as unknown as FindManyArg[][];
    const { orderBy } = calls[0][0];
    expect(orderBy[0]).toEqual({ isDemo: 'asc' });
    expect(orderBy[1]).toEqual({ priceCDF: 'asc' });
  });

  it('popularity ranks by unitsSold (best-seller) with recency as tiebreaker', async () => {
    const { service, findMany } = makeService();
    await service.browseProducts({ sortBy: 'popularity' } as never);
    const calls = findMany.mock.calls as unknown as FindManyArg[][];
    const { orderBy } = calls[0][0];
    expect(orderBy).toEqual([
      { isDemo: 'asc' },
      { unitsSold: 'desc' },
      { createdAt: 'desc' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Demo retirement (P3c) — ships dormant; activates per-category by real coverage
// ---------------------------------------------------------------------------
function makeRetireService(opts: {
  enabled: boolean;
  threshold?: number;
  realCounts?: Record<string, number>;
}) {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const groupBy = jest.fn().mockResolvedValue(
    Object.entries(opts.realCounts ?? {}).map(([categoryId, n]) => ({
      categoryId,
      _count: { _all: n },
    })),
  );
  const settingFindUnique = jest
    .fn()
    .mockImplementation(({ where: { key } }: { where: { key: string } }) => {
      if (key === 'RETIRE_DEMO_CATALOG') {
        return Promise.resolve({ value: opts.enabled ? 'true' : 'false' });
      }
      if (key === 'DEMO_RETIRE_THRESHOLD') {
        return Promise.resolve({ value: String(opts.threshold ?? 3) });
      }
      return Promise.resolve(null);
    });
  const prisma = {
    product: { findMany, count, groupBy },
    systemSetting: { findUnique: settingFindUnique },
  };
  const service = new BrowseService(prisma as never);
  return { service, findMany, groupBy };
}

describe('BrowseService.browseProducts — demo retirement (P3c)', () => {
  it('does NOT add a hide filter when retirement is OFF (dormant)', async () => {
    const { service, findMany, groupBy } = makeRetireService({
      enabled: false,
    });
    await service.browseProducts({} as never);
    const where = (
      findMany.mock.calls[0][0] as { where: Record<string, unknown> }
    ).where;
    expect(where.OR).toBeUndefined();
    expect(groupBy).not.toHaveBeenCalled(); // short-circuits before the count query
  });

  it('hides demo in covered categories when retirement is ON', async () => {
    // cat1 has 5 real (>= threshold 3) -> retired; cat2 has 1 -> not retired.
    const { service, findMany } = makeRetireService({
      enabled: true,
      threshold: 3,
      realCounts: { cat1: 5, cat2: 1 },
    });
    await service.browseProducts({} as never);
    const where = (
      findMany.mock.calls[0][0] as { where: Record<string, unknown> }
    ).where;
    expect(where.OR).toEqual([
      { isDemo: false },
      { categoryId: { notIn: ['cat1'] } },
    ]);
  });
});

describe('BrowseService.getCategoryAttributes — leaf-only', () => {
  function makeAttrService() {
    const attrFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      category: {
        findUnique: jest.fn().mockResolvedValue({ id: 'leaf1' }),
      },
      productAttribute: { findMany: attrFindMany },
    };
    const service = new BrowseService(prisma as never);
    return { service, attrFindMany, prisma };
  }

  it('queries attributes for the leaf category ONLY (no parent-chain merge)', async () => {
    const { service, attrFindMany } = makeAttrService();
    await service.getCategoryAttributes('leaf1');
    const where = attrFindMany.mock.calls[0][0].where;
    // Must be an exact-match on the leaf, NOT { categoryId: { in: [...] } }.
    expect(where).toEqual({ categoryId: 'leaf1' });
    expect(where.categoryId).not.toHaveProperty('in');
  });

  it('throws NotFound for an unknown category', async () => {
    const { service, prisma } = makeAttrService();
    prisma.category.findUnique.mockResolvedValueOnce(null);
    await expect(service.getCategoryAttributes('nope')).rejects.toThrow(
      'Catégorie non trouvée',
    );
  });
});
