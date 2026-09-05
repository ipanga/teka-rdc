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

// ── PDP characteristics are de-duplicated by name ──────────────────────────
// Remediating a product onto its correct leaf adds Taille/Couleur/Matière from
// that leaf beside identically named rows owned by its PREVIOUS category, so
// the buyer PDP printed each characteristic twice. Foreign rows are NOT dropped
// wholesale: production has 18 of them across 9 live products (a 10 kg bag of
// rice holds « Poids » from its parent category; an Android phone holds
// RAM/Mémoire interne from « … > Smartphones »), and 7 of those products would
// otherwise be left with no characteristics at all.
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

  it('KEEPS a foreign characteristic when no own-category row shares its name', async () => {
    // A 10 kg bag of rice legitimately carries « Poids » from its PARENT
    // category. Dropping foreign rows would blank 7 live products in production.
    const { service } = makePdpService([spec('z1', 'parent-cat', 'Poids', '10kg')]);
    const out = await service.getProductDetail('2mjco7');
    expect(out.specifications).toHaveLength(1);
    expect(out.specifications[0]).toMatchObject({ name: 'Poids', value: '10kg' });
  });

  it('keeps every foreign row when names do not collide', async () => {
    const { service } = makePdpService([
      spec('p1', 'other-cat', 'Mémoire interne', '16Go'),
      spec('p2', 'other-cat', 'RAM', '4Go'),
      spec('p3', 'other-cat', 'État', 'Neuf'),
    ]);
    const out = await service.getProductDetail('foyug0');
    expect(out.specifications).toHaveLength(3);
  });

  it('is a no-op for a product whose specifications all match its category', async () => {
    const { service } = makePdpService(own);
    const out = await service.getProductDetail('normal');
    expect(out.specifications).toHaveLength(3);
  });
});

// ── Deterministic precedence + normalisation ──────────────────────────────
describe('BrowseService.getProductDetail — precedence and normalisation', () => {
  const OWN = CHEMISES_CAT;

  it('current-category value WINS over a same-named foreign one', async () => {
    const { service } = makePdpService([
      spec('foreign', KITCHEN_CAT, 'Taille', 'XXL'), // stale
      spec('own', OWN, 'Taille', 'M'), // correct
    ]);
    const out = await service.getProductDetail('p');
    expect(out.specifications).toHaveLength(1);
    expect(out.specifications[0]).toMatchObject({ attributeId: 'own', value: 'M' });
  });

  it('wins regardless of the order rows arrive in from the database', async () => {
    const rows = [
      spec('own', OWN, 'Taille', 'M'),
      spec('foreign', KITCHEN_CAT, 'Taille', 'XXL'),
    ];
    for (const order of [rows, [...rows].reverse()]) {
      const { service } = makePdpService(order);
      const out = await service.getProductDetail('p');
      expect(out.specifications).toHaveLength(1);
      expect(out.specifications[0].value).toBe('M');
    }
  });

  it('treats accent/case/whitespace variants as the same characteristic', async () => {
    const { service } = makePdpService([
      spec('foreign', KITCHEN_CAT, '  matiere ', 'Polyester'),
      spec('own', OWN, 'Matière', 'Coton'),
    ]);
    const out = await service.getProductDetail('p');
    expect(out.specifications).toHaveLength(1);
    expect(out.specifications[0].value).toBe('Coton');
  });

  it('is deterministic when several FOREIGN rows share a name and none is own-category', async () => {
    const rows = [
      spec('bbb', 'cat-x', 'Type', 'B'),
      spec('aaa', 'cat-y', 'Type', 'A'),
    ];
    const first = await (await makePdpService(rows).service).getProductDetail('p');
    const second = await (await makePdpService([...rows].reverse()).service).getProductDetail('p');
    expect(first.specifications).toHaveLength(1);
    // attributeId is the stable final tiebreaker, so both orders agree.
    expect(first.specifications[0].attributeId).toBe('aaa');
    expect(second.specifications[0].attributeId).toBe('aaa');
  });

  it('keeps both when a current and a foreign row have DIFFERENT names', async () => {
    const { service } = makePdpService([
      spec('own', OWN, 'Taille', 'M'),
      spec('foreign', KITCHEN_CAT, 'Poids', '1kg'),
    ]);
    const out = await service.getProductDetail('p');
    expect(out.specifications.map((s: { name: string }) => s.name).sort()).toEqual(['Poids', 'Taille']);
  });
});

// --- Search analytics: source, intent and normalisation -----------------
//
// These cover the WRITE path only. Nothing here may change what a buyer sees:
// every assertion is about the row that gets logged, never about the products
// returned.

import { normalizeSearchTerm } from './browse.service';

/**
 * Harness for the FTS/trigram search path (the one that logs). It differs from
 * makeService() above because a search goes through $queryRaw for the ranked id
 * list and the count, then hydrates by id.
 */
function makeSearchService(opts: { total?: number; createRejects?: boolean } = {}) {
  const total = opts.total ?? 3;
  const create = jest.fn().mockImplementation(() =>
    opts.createRejects
      ? Promise.reject(new Error('db down'))
      : Promise.resolve({}),
  );
  let call = 0;
  const $queryRaw = jest.fn().mockImplementation(() => {
    call += 1;
    // 1st call: ranked ids. 2nd: COUNT(*).
    return Promise.resolve(call === 1 ? [] : [{ count: BigInt(total) }]);
  });
  const prisma = {
    $queryRaw,
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    searchSynonym: { findMany: jest.fn().mockResolvedValue([]) },
    systemSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    searchQuery: { create },
  };
  return { service: new BrowseService(prisma as never), create, prisma };
}

/** The `data` of the single searchQuery.create call, or null if never called. */
function loggedRow(create: jest.Mock): Record<string, unknown> | null {
  if (create.mock.calls.length === 0) return null;
  return (create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
}

describe('normalizeSearchTerm', () => {
  it('folds accents and case', () => {
    expect(normalizeSearchTerm('Télévision')).toBe('television');
    expect(normalizeSearchTerm('ROBE WAX')).toBe('robe wax');
    expect(normalizeSearchTerm('Chaussures Étendues')).toBe('chaussures etendues');
    // An accented and an unaccented spelling must land on ONE key, so a buyer
    // typing "telephone" and one typing "téléphone" count as the same demand.
    expect(normalizeSearchTerm('téléphone')).toBe(normalizeSearchTerm('TELEPHONE'));
  });

  // The reason this exists separately from stripAccents: stripAccents only
  // TRIMS, so "robe  wax" and "robe wax" were two aggregation keys for one
  // piece of demand.
  it('collapses every run of whitespace, not just the edges', () => {
    expect(normalizeSearchTerm('  Robe   Wax  ')).toBe('robe wax');
    expect(normalizeSearchTerm(['robe', 'wax'].join('\t'))).toBe('robe wax');
    expect(normalizeSearchTerm(['robe', 'wax'].join('\n' + '\n'))).toBe('robe wax');
    expect(normalizeSearchTerm('  Robe   Wax  ')).toBe(normalizeSearchTerm('Robe Wax'));
  });

  it('leaves an already-clean term alone', () => {
    expect(normalizeSearchTerm('samsung a54')).toBe('samsung a54');
  });
});

describe('BrowseService search logging - source', () => {
  it('records BUYER_WEB when the web client says so', async () => {
    const { service, create } = makeSearchService();
    await service.browseProducts({ search: 'robe', searchSource: 'BUYER_WEB' });
    expect(loggedRow(create)).toMatchObject({ source: 'BUYER_WEB' });
  });

  it('records BUYER_MOBILE when the mobile client says so', async () => {
    const { service, create } = makeSearchService();
    await service.browseProducts({ search: 'robe', searchSource: 'BUYER_MOBILE' });
    expect(loggedRow(create)).toMatchObject({ source: 'BUYER_MOBILE' });
  });

  // Backward compatibility: clients already in the wild send nothing. They must
  // keep contributing demand data, but must not be mislabelled as web.
  it('records UNKNOWN when the client sends no source', async () => {
    const { service, create } = makeSearchService();
    await service.browseProducts({ search: 'robe' });
    expect(loggedRow(create)).toMatchObject({ source: 'UNKNOWN' });
  });

  it('records UNKNOWN - never a guess - for an unrecognised source', async () => {
    for (const bad of ['SELLER_WEB', 'buyer_web', 'admin', '']) {
      const { service, create } = makeSearchService();
      await service.browseProducts({ search: 'robe', searchSource: bad });
      expect(loggedRow(create)).toMatchObject({ source: 'UNKNOWN' });
    }
  });

  it('never breaks the search itself over a bad source value', async () => {
    const { service } = makeSearchService();
    await expect(
      service.browseProducts({ search: 'robe', searchSource: ' junk' }),
    ).resolves.toBeDefined();
  });
});

describe('BrowseService search logging - intent', () => {
  it('records an explicit SUBMIT', async () => {
    const { service, create } = makeSearchService();
    await service.browseProducts({ search: 'robe', searchIntent: 'SUBMIT' });
    expect(loggedRow(create)).toMatchObject({ intent: 'SUBMIT' });
  });

  it('records a SUGGESTION selection distinctly', async () => {
    const { service, create } = makeSearchService();
    await service.browseProducts({ search: 'nike', searchIntent: 'SUGGESTION' });
    expect(loggedRow(create)).toMatchObject({ intent: 'SUGGESTION' });
  });

  it('defaults a missing intent to SUBMIT so old clients keep counting', async () => {
    const { service, create } = makeSearchService();
    await service.browseProducts({ search: 'robe' });
    expect(loggedRow(create)).toMatchObject({ intent: 'SUBMIT' });
  });

  // The duplicate-demand fix: applying a filter, changing the sort, paging or
  // pull-to-refresh re-runs a search the buyer already made.
  it('records NOTHING for a REFINE re-fetch', async () => {
    const { service, create } = makeSearchService();
    await service.browseProducts({ search: 'robe', searchIntent: 'REFINE' });
    expect(create).not.toHaveBeenCalled();
  });

  it('records nothing for an unrecognised intent rather than guessing', async () => {
    for (const bad of ['TYPING', 'submit', 'CLICK']) {
      const { service, create } = makeSearchService();
      await service.browseProducts({ search: 'robe', searchIntent: bad });
      expect(create).not.toHaveBeenCalled();
    }
  });

  it('still returns results for a REFINE request', async () => {
    const { service } = makeSearchService();
    const res = await service.browseProducts({
      search: 'robe',
      searchIntent: 'REFINE',
    });
    expect(res.data).toBeDefined();
  });
});

describe('BrowseService search logging - what gets stored', () => {
  it('stores the normalised key and keeps the original term for display', async () => {
    const { service, create } = makeSearchService();
    await service.browseProducts({ search: '  Robe   WAX  ' });
    expect(loggedRow(create)).toMatchObject({
      term: 'Robe   WAX',
      termNormalized: 'robe wax',
    });
  });

  it('records the result count, including zero', async () => {
    const hit = makeSearchService({ total: 7 });
    await hit.service.browseProducts({ search: 'robe' });
    expect(loggedRow(hit.create)).toMatchObject({ resultCount: 7 });

    const miss = makeSearchService({ total: 0 });
    await miss.service.browseProducts({ search: 'xyzzy' });
    expect(loggedRow(miss.create)).toMatchObject({ resultCount: 0 });
  });

  it('records the town when the search is city-scoped', async () => {
    const cityId = '01000000-0000-0000-0000-000000000001';
    const { service, create } = makeSearchService();
    await service.browseProducts({ search: 'robe', cityId });
    expect(loggedRow(create)).toMatchObject({ cityId });
  });

  it('records a null town when the search is nationwide', async () => {
    const { service, create } = makeSearchService();
    await service.browseProducts({ search: 'robe' });
    expect(loggedRow(create)).toMatchObject({ cityId: null });
  });

  it('drops sub-2-character noise at write time', async () => {
    for (const term of ['a', ' b ']) {
      const { service, create } = makeSearchService();
      await service.browseProducts({ search: term });
      expect(create).not.toHaveBeenCalled();
    }
  });

  // Two different buyers searching the same term are two demand signals. There
  // is no de-duplication and no identity column - one row per event.
  it('records two rows when two buyers search the same normalised term', async () => {
    const { service, create } = makeSearchService();
    await service.browseProducts({ search: 'Robe Wax', searchSource: 'BUYER_WEB' });
    await service.browseProducts({ search: 'robe  wax', searchSource: 'BUYER_MOBILE' });

    expect(create).toHaveBeenCalledTimes(2);
    const rows = create.mock.calls.map(
      (c) => (c[0] as { data: Record<string, unknown> }).data,
    );
    // Same aggregation key - so they add up as one term...
    expect(rows[0].termNormalized).toBe('robe wax');
    expect(rows[1].termNormalized).toBe('robe wax');
    // ...while staying two separate, attributable events.
    expect(rows[0].source).toBe('BUYER_WEB');
    expect(rows[1].source).toBe('BUYER_MOBILE');
  });

  it('stores no user, session, IP or device identifier', async () => {
    const { service, create } = makeSearchService();
    await service.browseProducts({ search: 'robe' });
    expect(Object.keys(loggedRow(create) ?? {}).sort()).toEqual([
      'cityId', 'intent', 'resultCount', 'source', 'term', 'termNormalized',
    ]);
  });
});

describe('BrowseService search logging - failure isolation', () => {
  // Analytics is non-critical telemetry. A logging failure must never surface
  // to the buyer as a failed search.
  it('returns results normally when the analytics write rejects', async () => {
    const { service, create } = makeSearchService({ createRejects: true });
    const res = await service.browseProducts({ search: 'robe' });
    expect(create).toHaveBeenCalled();
    expect(res.data).toBeDefined();
    expect(res.pagination).toBeDefined();
  });

  it('survives the searchQuery delegate being absent entirely', async () => {
    const { service, prisma } = makeSearchService();
    delete (prisma as { searchQuery?: unknown }).searchQuery;
    await expect(service.browseProducts({ search: 'robe' })).resolves.toBeDefined();
  });

  it('does not await the analytics write', async () => {
    let resolveCreate: (v: unknown) => void = () => {};
    const pending = new Promise((r) => {
      resolveCreate = r;
    });
    const { service, prisma } = makeSearchService();
    (prisma.searchQuery.create as jest.Mock).mockReturnValue(pending);
    // Resolves even though the log write is still outstanding.
    await expect(service.browseProducts({ search: 'robe' })).resolves.toBeDefined();
    resolveCreate({});
  });
});

describe('BrowseService — public seller shape never carries verification documents (PR 2)', () => {
  it('the product-detail seller select is an allow-list of id/name only', async () => {
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new BrowseService(prisma as never);
    await service.getProductDetail('00000000-0000-0000-0000-000000000001').catch(() => undefined);
    const call = (prisma.product.findFirst.mock.calls[0] ?? prisma.product.findUnique.mock.calls[0])?.[0];
    expect(call).toBeDefined();
    const sellerSelect = JSON.stringify(call.include?.seller ?? call.select?.seller ?? {});
    expect(sellerSelect).toContain('businessName');
    expect(sellerSelect).not.toMatch(/documents|cloudinary|idDocument|verificationNote|idNumber/);
  });
});
