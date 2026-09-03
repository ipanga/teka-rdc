import { SearchAnalyticsService, LOW_RESULT_MAX } from './search-analytics.service';

/**
 * Unit coverage for the admin search-analytics read surface.
 *
 * Aggregation itself is pushed into Postgres, so these pin the SEMANTICS that
 * SQL alone cannot show: which population each metric divides by, that UNKNOWN
 * is never folded into web, how trending avoids a zero baseline, and that the
 * filters compose. End-to-end numbers were verified against the real dev table
 * (see docs/search-sales-analytics.md).
 */
function makeService(queue: unknown[][] = []) {
  const pending = [...queue];
  const $queryRaw = jest
    .fn()
    .mockImplementation(() => Promise.resolve(pending.length ? pending.shift() : []));
  const prisma = {
    $queryRaw,
    city: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { service: new SearchAnalyticsService(prisma as never), prisma, $queryRaw };
}

function sqlOf(mock: jest.Mock, call = 0): string {
  const arg = mock.mock.calls[call][0] as { strings?: string[]; sql?: string };
  return (arg.strings ? arg.strings.join(' ') : (arg.sql ?? '')).replace(/\s+/g, ' ');
}

function paramsOf(mock: jest.Mock, call = 0): unknown[] {
  const arg = mock.mock.calls[call][0] as { values?: unknown[] };
  return arg.values ?? [];
}

const summaryRow = (o: Partial<Record<string, number>> = {}) => [
  {
    total: BigInt(o.total ?? 0),
    unique_terms: BigInt(o.unique ?? 0),
    zero: BigInt(o.zero ?? 0),
    low: BigInt(o.low ?? 0),
    suggestion: BigInt(o.suggestion ?? 0),
    unknown_source: BigInt(o.unknown ?? 0),
  },
];

describe('SearchAnalyticsService.getSummary — metric definitions', () => {
  it('divides every rate by totalSearches, the rows matching the filters', async () => {
    const { service } = makeService([
      summaryRow({ total: 200, unique: 40, zero: 50, low: 20, suggestion: 10, unknown: 5 }),
    ]);
    const s = await service.getSummary({});
    expect(s.totalSearches).toBe(200);
    expect(s.zeroResultRate).toBe(25);      // 50/200
    expect(s.lowResultRate).toBe(10);       // 20/200
    expect(s.suggestionRate).toBe(5);       // 10/200
  });

  it('reports 0 %, not NaN or Infinity, on an empty population', async () => {
    const { service } = makeService([summaryRow({})]);
    const s = await service.getSummary({});
    expect(s.totalSearches).toBe(0);
    expect(s.zeroResultRate).toBe(0);
    expect(s.suggestionRate).toBe(0);
    expect(Number.isFinite(s.zeroResultRate)).toBe(true);
  });

  it('exposes the low-result threshold so the label can state it exactly', async () => {
    const { service } = makeService([summaryRow({ total: 10, low: 3 })]);
    const s = await service.getSummary({});
    expect(s.lowResultMax).toBe(LOW_RESULT_MAX);
  });

  // UNKNOWN is a real cohort (clients predating the source parameter), not a
  // rounding error to hide inside "web".
  it('counts UNKNOWN-source searches separately', async () => {
    const { service } = makeService([summaryRow({ total: 10, unknown: 4 })]);
    expect((await service.getSummary({})).unknownSourceSearches).toBe(4);
  });
});

describe('SearchAnalyticsService — filters', () => {
  it('applies a CAT date window, not UTC', async () => {
    const { service, $queryRaw } = makeService([summaryRow({})]);
    await service.getSummary({ dateFrom: '2026-06-01', dateTo: '2026-06-30' });
    const p = paramsOf($queryRaw) as Date[];
    expect(p.some((v) => v instanceof Date && v.toISOString() === '2026-05-31T22:00:00.000Z')).toBe(true);
    expect(p.some((v) => v instanceof Date && v.toISOString() === '2026-06-30T22:00:00.000Z')).toBe(true);
  });

  it('omits date bounds entirely when none is given', async () => {
    const { service, $queryRaw } = makeService([summaryRow({})]);
    await service.getSummary({});
    expect(sqlOf($queryRaw)).not.toContain('"createdAt" >=');
  });

  it('filters by town, source, intent and zero-result, composably', async () => {
    const { service, $queryRaw } = makeService([summaryRow({})]);
    await service.getSummary({
      cityId: '01000000-0000-0000-0000-000000000001',
      source: 'BUYER_MOBILE',
      intent: 'SUGGESTION',
      zeroResultsOnly: 'true',
    });
    const sql = sqlOf($queryRaw);
    expect(sql).toContain('"cityId"::text =');
    expect(sql).toContain('"source"::text =');
    expect(sql).toContain('"intent"::text =');
    expect(sql).toContain('"resultCount" = 0');
    const p = paramsOf($queryRaw);
    expect(p).toContain('BUYER_MOBILE');
    expect(p).toContain('SUGGESTION');
  });

  it('does not filter on zero results unless explicitly asked', async () => {
    const { service, $queryRaw } = makeService([summaryRow({})]);
    await service.getSummary({ zeroResultsOnly: 'false' });
    expect(sqlOf($queryRaw)).not.toContain('"resultCount" = 0 ');
  });
});

describe('SearchAnalyticsService.getTerms', () => {
  const row = (o: Partial<Record<string, unknown>> = {}) => ({
    key: 'robe wax',
    label: 'Robe Wax',
    searches: BigInt(5),
    zeroResults: BigInt(0),
    lastSeen: new Date('2026-09-01T10:00:00Z'),
    maxResultCount: 4,
    avgResultCount: '2.5',
    ...o,
  });

  it('aggregates on the normalised term but shows the readable form', async () => {
    const { service } = makeService([[row()], [{ n: BigInt(1) }]]);
    const res = await service.getTerms({});
    expect(res.data[0]).toMatchObject({
      term: 'Robe Wax',
      termNormalized: 'robe wax',
      searches: 5,
      avgResultCount: 2.5,
    });
  });

  // The distinction the page exists to make: a term that has never returned
  // anything is a catalog/search gap; one that returns products elsewhere is a
  // town-coverage gap. Never assume every zero-result term is missing stock.
  it('flags a term that has never returned a single product', async () => {
    const { service } = makeService([
      [row({ key: 'riz local', maxResultCount: 0, zeroResults: BigInt(3) })],
      [{ n: BigInt(1) }],
    ]);
    expect((await service.getTerms({})).data[0].neverAnyResult).toBe(true);
  });

  it('does NOT flag a term that returns products somewhere', async () => {
    const { service } = makeService([
      [row({ maxResultCount: 4, zeroResults: BigInt(1) })],
      [{ n: BigInt(1) }],
    ]);
    expect((await service.getTerms({})).data[0].neverAnyResult).toBe(false);
  });

  it('paginates with LIMIT/OFFSET and returns the standard envelope', async () => {
    const { service, $queryRaw } = makeService([[], [{ n: BigInt(70) }]]);
    const res = await service.getTerms({ page: 3, limit: 25 });
    expect(paramsOf($queryRaw)).toEqual(expect.arrayContaining([25, 50]));
    expect(res.pagination).toEqual({ page: 3, limit: 25, total: 70, totalPages: 3 });
  });

  it('clamps an oversized limit', async () => {
    const { service, $queryRaw } = makeService([[], [{ n: BigInt(0) }]]);
    await service.getTerms({ limit: 99999 });
    expect(paramsOf($queryRaw)).toContain(200);
  });

  it('returns an empty page cleanly', async () => {
    const { service } = makeService([[], [{ n: BigInt(0) }]]);
    const res = await service.getTerms({});
    expect(res.data).toEqual([]);
    expect(res.pagination.totalPages).toBe(0);
  });

  it('issues exactly two queries — page and count, never one per row', async () => {
    const { service, $queryRaw } = makeService([
      [row(), row({ key: 'a' }), row({ key: 'b' })],
      [{ n: BigInt(3) }],
    ]);
    await service.getTerms({});
    expect($queryRaw.mock.calls).toHaveLength(2);
  });
});

describe('SearchAnalyticsService.getTrending', () => {
  it('compares the recent half of the window with the preceding half', async () => {
    const { service, $queryRaw } = makeService([
      [{ key: 'riz', label: 'Riz', recent: BigInt(9), previous: BigInt(4) }],
    ]);
    const res = await service.getTrending({ dateFrom: '2026-06-01', dateTo: '2026-06-30' });
    expect(res.data[0]).toMatchObject({ recent: 9, previous: 4, delta: 5, isNew: false });
    expect(sqlOf($queryRaw)).toContain('FILTER (WHERE');
  });

  // No percentage from a zero baseline — that is undefined, not infinite growth.
  it('marks a term absent from the previous half as new instead of computing a %', async () => {
    const { service } = makeService([
      [{ key: 'nouveau', label: 'Nouveau', recent: BigInt(4), previous: BigInt(0) }],
    ]);
    const row = (await service.getTrending({})).data[0];
    expect(row.isNew).toBe(true);
    expect(row.delta).toBe(4);
    expect(row).not.toHaveProperty('growthRate');
  });

  it('reports a falling term with a negative delta', async () => {
    const { service } = makeService([
      [{ key: 'x', label: 'X', recent: BigInt(1), previous: BigInt(6) }],
    ]);
    expect((await service.getTrending({})).data[0].delta).toBe(-5);
  });

  it('exposes the window boundaries it used', async () => {
    const { service } = makeService([[]]);
    const res = await service.getTrending({ dateFrom: '2026-06-01', dateTo: '2026-06-30' });
    expect(new Date(res.window.start).getTime()).toBeLessThan(new Date(res.window.mid).getTime());
    expect(new Date(res.window.mid).getTime()).toBeLessThan(new Date(res.window.end).getTime());
  });

  it('runs a single bounded query, both halves in one pass', async () => {
    const { service, $queryRaw } = makeService([[]]);
    await service.getTrending({});
    expect($queryRaw.mock.calls).toHaveLength(1);
  });
});

describe('SearchAnalyticsService.getBreakdown', () => {
  it('buckets days in Africa/Lubumbashi', async () => {
    const { service, $queryRaw } = makeService([[]]);
    await service.getBreakdown({ by: 'day' });
    expect(sqlOf($queryRaw)).toContain("AT TIME ZONE 'Africa/Lubumbashi'");
  });

  it('hydrates town names with ONE lookup for the whole page', async () => {
    const { service, prisma } = makeService([
      [
        { key: 'c1', searches: BigInt(3), zero: BigInt(1) },
        { key: 'c2', searches: BigInt(2), zero: BigInt(0) },
        { key: 'c3', searches: BigInt(1), zero: BigInt(0) },
      ],
    ]);
    (prisma.city.findMany as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'Lubumbashi' },
      { id: 'c2', name: 'Kolwezi' },
      { id: 'c3', name: 'Likasi' },
    ]);
    const res = await service.getBreakdown({ by: 'town' });
    expect((prisma.city.findMany as jest.Mock).mock.calls).toHaveLength(1);
    expect(res.data.map((r) => r.label)).toEqual(['Lubumbashi', 'Kolwezi', 'Likasi']);
  });

  it('labels town-less searches rather than dropping them', async () => {
    const { service } = makeService([[{ key: null, searches: BigInt(4), zero: BigInt(0) }]]);
    const res = await service.getBreakdown({ by: 'town' });
    expect(res.data[0].label).toBe('Sans ville');
  });

  it('skips the city lookup when there are no towns to name', async () => {
    const { service, prisma } = makeService([[]]);
    await service.getBreakdown({ by: 'town' });
    expect((prisma.city.findMany as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('keeps UNKNOWN as its own source bucket', async () => {
    const { service } = makeService([
      [
        { key: 'BUYER_WEB', searches: BigInt(10), zero: BigInt(2) },
        { key: 'UNKNOWN', searches: BigInt(3), zero: BigInt(0) },
      ],
    ]);
    const res = await service.getBreakdown({ by: 'source' });
    expect(res.data.map((r) => r.label)).toEqual(['BUYER_WEB', 'UNKNOWN']);
  });
});

describe('SearchAnalyticsService.generateCsv', () => {
  function mockRes() {
    return { setHeader: jest.fn(), write: jest.fn(), end: jest.fn() };
  }
  const written = (res: { write: jest.Mock }) =>
    res.write.mock.calls.map((c) => c[0] as string).join('');

  const event = (o: Partial<Record<string, unknown>> = {}) => ({
    createdAt: new Date('2026-09-01T10:00:00Z'),
    term: 'Télévision',
    termNormalized: 'television',
    source: 'BUYER_WEB',
    intent: 'SUBMIT',
    resultCount: 4,
    cityName: 'Lubumbashi',
    ...o,
  });

  it('writes French accented headers behind a BOM', async () => {
    const { service } = makeService([[]]);
    const res = mockRes();
    await service.generateCsv({}, res as never);
    const out = written(res);
    expect(res.write.mock.calls[0][0]).toBe('\uFEFF');
    expect(out).toContain('Terme recherché');
    expect(out).toContain('Terme normalisé');
    expect(out).toContain('Résultats');
  });

  it('preserves accents in the exported values', async () => {
    const { service } = makeService([[event()]]);
    const res = mockRes();
    await service.generateCsv({}, res as never);
    expect(written(res)).toContain('Télévision');
  });

  // A buyer can type anything into the search box, so the term is
  // user-controlled text and must go through the shared formula guard.
  it('neutralises a formula typed into the search box', async () => {
    const { service } = makeService([
      [event({ term: "=cmd|'/c calc'!A1", termNormalized: "=cmd|'/c calc'!a1" })],
    ]);
    const res = mockRes();
    await service.generateCsv({}, res as never);
    const out = written(res);
    expect(out).toContain(`"'=cmd|'/c calc'!A1"`);
    expect(out).not.toContain(",=cmd");
  });

  it('keeps the result count numeric, never formula-prefixed', async () => {
    const { service } = makeService([[event({ resultCount: 0 })]]);
    const res = mockRes();
    await service.generateCsv({}, res as never);
    expect(written(res)).toContain(',0,oui');
  });

  it('respects the active filters', async () => {
    const { service, $queryRaw } = makeService([[]]);
    const res = mockRes();
    await service.generateCsv({ source: 'BUYER_MOBILE', zeroResultsOnly: 'true' }, res as never);
    const sql = sqlOf($queryRaw);
    expect(sql).toContain('"source"::text =');
    expect(sql).toContain('"resultCount" = 0');
  });

  it('produces a header-only file when nothing matches', async () => {
    const { service } = makeService([[]]);
    const res = mockRes();
    await service.generateCsv({}, res as never);
    expect(res.write).toHaveBeenCalledTimes(2); // BOM + header
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it('caps the export rather than streaming an unbounded table', async () => {
    const { service, $queryRaw } = makeService([[]]);
    const res = mockRes();
    await service.generateCsv({}, res as never);
    expect(paramsOf($queryRaw)).toContain(50_001);
  });
});
