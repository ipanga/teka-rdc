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
        // 0 live children => leaf, which is what this block already assumed.
        count: jest.fn().mockResolvedValue(0),
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

describe('BrowseService.getProductDetail — specification labels', () => {
  // The human label lives on ProductAttribute.name, but every client
  // (buyer-mobile, buyer-web, admin-web) reads a flat `spec.name`. Before the
  // flattening the key was simply absent, so the "Caractéristiques" table
  // rendered values with blank labels ("M" instead of "Taille : M").
  function makeDetailService(specifications: unknown[]) {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'p1',
      categoryId: 'c1',
      isDemo: false,
      images: [],
      specifications,
      category: null,
      city: null,
      seller: { id: 's1', firstName: 'A', lastName: 'B', sellerProfile: null },
    });
    const prisma = {
      product: { findFirst },
      systemSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    return new BrowseService(prisma as never);
  }

  // categoryId matches the product's own category ('c1'): these fixtures model
  // an ordinary product, whose characteristics all belong to its category. The
  // PDP now scopes specifications to that category, so the field is required.
  const spec = (name: string, value: string, sortOrder = 0, id = name) => ({
    id,
    attributeId: `attr-${id}`,
    value,
    attribute: { name, sortOrder, categoryId: 'c1' },
  });

  it('flattens attribute.name onto the spec', async () => {
    const service = makeDetailService([spec('Taille', 'M')]);
    const result = (await service.getProductDetail(
      'abc123',
    )) as unknown as { specifications: Array<Record<string, unknown>> };

    expect(result.specifications).toEqual([
      {
        id: 'Taille',
        attributeId: 'attr-Taille',
        name: 'Taille',
        value: 'M',
        sortOrder: 0,
      },
    ]);
  });

  it('requests the attribute sortOrder ordering', async () => {
    const service = makeDetailService([]);
    await service.getProductDetail('abc123');
    // Ordering is delegated to Prisma so the admin-configured order survives.
    const prisma = (service as unknown as { prisma: { product: { findFirst: jest.Mock } } })
      .prisma;
    const arg = prisma.product.findFirst.mock.calls[0][0] as {
      include: { specifications: { orderBy: unknown } };
    };
    expect(arg.include.specifications.orderBy).toEqual({
      attribute: { sortOrder: 'asc' },
    });
  });

  it('drops specs with no label or no value', async () => {
    const service = makeDetailService([
      spec('Taille', 'M', 0, 'a'),
      spec('', 'Coton', 1, 'b'),
      spec('Couleur', '   ', 2, 'c'),
    ]);
    const result = (await service.getProductDetail(
      'abc123',
    )) as unknown as { specifications: Array<Record<string, unknown>> };

    expect(result.specifications.map((s) => s.name)).toEqual(['Taille']);
  });
});

// ── getCategoryAttributes: leaf-only, ENFORCED ─────────────────────────────
// Reproduces the reported defect: « Mode > Homme » (an intermediate node) still
// carries legacy rows "Type" and "Type de peau", so a men's shirt attached to it
// rendered a skin-type field under « Caractéristiques du produit ».
const HOMME = '13000000-0000-0000-0000-000000000501';
const CHEMISES = '16000000-0000-0000-0000-000000050102';

const LEGACY_NON_LEAF_ROWS = [
  { id: '14000000-0000-0000-0000-000000050101', name: 'Type' },
  { id: '14000000-0000-0000-0000-000000050102', name: 'Type de peau' },
];
const CHEMISES_ROWS = [
  { id: '14000000-0000-0000-0000-000005010201', name: 'Taille' },
  { id: '14000000-0000-0000-0000-000005010202', name: 'Couleur' },
  { id: '14000000-0000-0000-0000-000005010203', name: 'Matière' },
];

function makeAttrService(childCount: number, rows: Array<Record<string, string>>) {
  const attrFindMany = jest.fn().mockResolvedValue(rows);
  const prisma = {
    category: {
      findUnique: jest.fn().mockResolvedValue({ id: 'c' }),
      count: jest.fn().mockResolvedValue(childCount),
    },
    productAttribute: { findMany: attrFindMany },
  };
  return { service: new BrowseService(prisma as never), attrFindMany, prisma };
}

describe('BrowseService.getCategoryAttributes — leaf-only invariant', () => {
  it('returns no attributes for an intermediate category', async () => {
    const { service } = makeAttrService(8, LEGACY_NON_LEAF_ROWS);
    await expect(service.getCategoryAttributes(HOMME)).resolves.toEqual([]);
  });

  it('never leaks "Type de peau" onto a menswear node', async () => {
    const { service } = makeAttrService(8, LEGACY_NON_LEAF_ROWS);
    const out = await service.getCategoryAttributes(HOMME);
    expect(out.map((a: { name: string }) => a.name)).not.toContain('Type de peau');
  });

  it('does not even query attribute rows for an intermediate category', async () => {
    const { service, attrFindMany } = makeAttrService(8, LEGACY_NON_LEAF_ROWS);
    await service.getCategoryAttributes(HOMME);
    expect(attrFindMany).not.toHaveBeenCalled();
  });

  it('still returns the full attribute set for a leaf', async () => {
    const { service } = makeAttrService(0, CHEMISES_ROWS);
    const out = await service.getCategoryAttributes(CHEMISES);
    expect(out.map((a: { name: string }) => a.name)).toEqual([
      'Taille',
      'Couleur',
      'Matière',
    ]);
  });

  it('counts only live children (soft-deleted ones must not make a leaf look intermediate)', async () => {
    const { service, prisma } = makeAttrService(0, CHEMISES_ROWS);
    await service.getCategoryAttributes(CHEMISES);
    expect(prisma.category.count).toHaveBeenCalledWith({
      where: { parentCategoryId: CHEMISES, deletedAt: null },
    });
  });
});

// ── PDP characteristics belong to the product's own category ───────────────
// Legacy specifications are preserved in the database when a product is
// remediated onto its correct leaf, but they must not surface. « Électroménager
// > Cuisine » also owns attributes named Taille/Couleur/Matière, so rendering
// every row printed each characteristic TWICE on the buyer PDP; and a stale
// « Type » from a soft-deleted category showed on a product whose new leaf has
// no Type attribute at all.
const CHEMISES_CAT = '16000000-0000-0000-0000-000000050102';
const KITCHEN_CAT = '13000000-0000-0000-0000-000000000401';

function makePdpService(specs: Array<Record<string, unknown>>) {
  const prisma = {
    product: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'p1',
        categoryId: CHEMISES_CAT,
        isDemo: false,
        specifications: specs,
        images: [],
        seller: { id: 's1', sellerProfile: null },
        category: { id: CHEMISES_CAT, name: 'Chemises', parentCategory: null },
      }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    systemSetting: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  return { service: new BrowseService(prisma as never), prisma };
}

const spec = (attributeId: string, categoryId: string, name: string, value: string) => ({
  id: `s-${attributeId}`,
  attributeId,
  value,
  attribute: { id: attributeId, name, categoryId, sortOrder: 0 },
});

describe('BrowseService.getProductDetail — specification scoping', () => {
  const own = [
    spec('a1', CHEMISES_CAT, 'Taille', 'M'),
    spec('a2', CHEMISES_CAT, 'Couleur', 'Bleu'),
    spec('a3', CHEMISES_CAT, 'Matière', 'Coton'),
  ];
  const foreign = [
    spec('b1', KITCHEN_CAT, 'Taille', 'M'),
    spec('b2', KITCHEN_CAT, 'Couleur', 'Bleu'),
    spec('b3', KITCHEN_CAT, 'Matière', 'Coton'),
  ];

  it('renders each characteristic once when legacy foreign rows are preserved', async () => {
    const { service } = makePdpService([...foreign, ...own]);
    const out = await service.getProductDetail('h0d799');
    expect(out.specifications).toHaveLength(3);
    expect(out.specifications.map((s: { name: string }) => s.name)).toEqual([
      'Taille',
      'Couleur',
      'Matière',
    ]);
  });

  it('keeps the values from the product\'s OWN category attributes', async () => {
    const { service } = makePdpService([...foreign, ...own]);
    const out = await service.getProductDetail('h0d799');
    expect(out.specifications.map((s: { attributeId: string }) => s.attributeId))
      .toEqual(['a1', 'a2', 'a3']);
  });

  it('hides a stale legacy characteristic the new leaf does not define', async () => {
    // vnkqce: « Type = Savon de lessive » owned by a soft-deleted category.
    const { service } = makePdpService([spec('z1', 'dead-cat', 'Type', 'Savon de lessive')]);
    const out = await service.getProductDetail('vnkqce');
    expect(out.specifications).toEqual([]);
  });

  it('is a no-op for a product whose specifications all match its category', async () => {
    const { service } = makePdpService(own);
    const out = await service.getProductDetail('normal');
    expect(out.specifications).toHaveLength(3);
  });
});
