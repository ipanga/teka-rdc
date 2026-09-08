import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sitemap, {
  fetchAllSitemapProducts,
  PRODUCT_PAGE_LIMIT,
  MAX_PRODUCT_PAGES,
  SitemapSourceError,
  type SitemapProduct,
} from './sitemap';

// Minimal API fixtures keyed by endpoint.
const CITIES = [
  { id: 'c1', slug: 'lubumbashi', isActive: true },
  { id: 'c2', slug: 'kolwezi', isActive: true },
  { id: 'c3', slug: 'goma', isActive: false }, // inactive → excluded
];
const CATEGORIES = [
  { id: 'cat1', slug: 'telephones', subcategories: [{ id: 'sub1', slug: 'smartphones' }] },
  { id: 'cat2', slug: null }, // no slug → excluded
];

/** A catalogue larger than one API page, so the cursor walk is exercised. */
function catalogue(count: number): SitemapProduct[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    slug: `produit-${i + 1}`,
    shortCode: `a${String(i + 1).padStart(5, '0')}`,
    citySlug: i % 2 === 0 ? 'lubumbashi' : 'kolwezi',
    updatedAt: `2026-09-0${(i % 7) + 1}T10:00:00.000Z`,
  }));
}

/**
 * Mock the browse API the way it really paginates: `limit` is capped at 100
 * (a larger value is a 400), pages are cut at `limit`, and `nextCursor` is the
 * last product id of the page.
 */
function mockApi(opts: {
  products?: SitemapProduct[];
  failProductsPage?: number; // 0-based page index that answers 500
  productsStatus?: number; // status for every products request
}) {
  const products = opts.products ?? catalogue(3);
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      const u = new URL(url);
      const json = (data: unknown, status = 200) =>
        ({ ok: status < 400, status, json: async () => ({ data }) }) as Response;
      if (u.pathname.endsWith('/v1/cities')) return json(CITIES);
      if (u.pathname.endsWith('/v1/browse/categories')) return json(CATEGORIES);
      if (u.pathname.endsWith('/v1/browse/products')) {
        if (opts.productsStatus) return json(null, opts.productsStatus);
        const limit = Number(u.searchParams.get('limit') ?? '20');
        if (limit > 100) return json(null, 400);
        const cursor = u.searchParams.get('cursor');
        const start = cursor ? products.findIndex((p) => p.id === cursor) + 1 : 0;
        const pageIndex = calls.filter((c) => c.includes('/v1/browse/products')).length - 1;
        if (opts.failProductsPage === pageIndex) return json(null, 500);
        const page = products.slice(start, start + limit);
        const hasMore = start + limit < products.length;
        return json({
          data: page,
          pagination: { nextCursor: hasMore ? page[page.length - 1].id : null, hasMore },
        });
      }
      return json(null, 404);
    }),
  );
  return { calls };
}

beforeEach(() => {
  mockApi({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sitemap (city-first URLs)', () => {
  it('emits /{ville} city landing paths for active cities only', async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain('https://teka.cd/lubumbashi');
    expect(urls).toContain('https://teka.cd/kolwezi');
    expect(urls).not.toContain('https://teka.cd/goma'); // inactive
    // No legacy query-string city pages.
    expect(urls.some((u) => u.includes('?cityId='))).toBe(false);
  });

  it('emits city-scoped category URLs (categories × active cities)', async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain('https://teka.cd/lubumbashi/categorie/telephones');
    expect(urls).toContain('https://teka.cd/lubumbashi/categorie/smartphones');
    expect(urls).toContain('https://teka.cd/kolwezi/categorie/telephones');
    // slugless category is skipped
    expect(urls.every((u) => !u.endsWith('/categorie/null'))).toBe(true);
  });

  it('emits canonical product URLs /{ville}/{slug}-{shortCode}, skipping city-less', async () => {
    mockApi({
      products: [
        { id: 'p1', slug: 'iphone-15', shortCode: 'a1b2c3', citySlug: 'lubumbashi' },
        { id: 'p2', slug: 'galaxy', shortCode: 'd4e5f6', citySlug: 'kolwezi' },
        { id: 'p3', slug: 'orphan', shortCode: 'z9z9z9', citySlug: null }, // no city → excluded
        // No shortCode → the route would parse the slug's code-shaped tail
        // and 404; never listed (data repair, not a URL).
        { id: 'p4', slug: 'robe-wax-849210', shortCode: null, citySlug: 'lubumbashi' },
      ],
    });
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain('https://teka.cd/lubumbashi/iphone-15-a1b2c3');
    expect(urls).toContain('https://teka.cd/kolwezi/galaxy-d4e5f6');
    // product without a city is not listed (would be a non-canonical 308 hop)
    expect(urls.some((u) => u.includes('orphan'))).toBe(false);
    expect(urls.some((u) => u.includes('robe-wax'))).toBe(false);
  });

  it('keeps home + static pages, lists /promotions and never the noindex /recherche', async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain('https://teka.cd/');
    expect(urls).toContain('https://teka.cd/a-propos');
    expect(urls).toContain('https://teka.cd/categories');
    expect(urls).toContain('https://teka.cd/promotions');
    expect(urls).not.toContain('https://teka.cd/recherche');
  });
});

describe('sitemap — product enumeration (SEO-1)', () => {
  it('walks the cursor across several API pages at the real limit and lists every product once', async () => {
    const products = catalogue(250); // 3 pages at limit=100
    const { calls } = mockApi({ products });
    const entries = await sitemap();
    const productUrls = entries.map((e) => e.url).filter((u) => /\/produit-\d+-a\d{5}$/.test(u));
    expect(productUrls).toHaveLength(250);
    expect(new Set(productUrls).size).toBe(250);
    expect(productUrls).toContain('https://teka.cd/lubumbashi/produit-1-a00001');
    expect(productUrls).toContain('https://teka.cd/kolwezi/produit-250-a00250');
    const productCalls = calls.filter((c) => c.includes('/v1/browse/products'));
    expect(productCalls).toHaveLength(3);
    for (const c of productCalls) expect(new URL(c).searchParams.get('limit')).toBe(String(PRODUCT_PAGE_LIMIT));
    expect(new URL(productCalls[1]).searchParams.get('cursor')).toBe('p100');
    expect(new URL(productCalls[2]).searchParams.get('cursor')).toBe('p200');
  });

  it('never asks for more than the API allows (the old limit=500 was a 400 and silently emptied the sitemap)', async () => {
    const { calls } = mockApi({ products: catalogue(5) });
    await sitemap();
    const limits = calls
      .filter((c) => c.includes('/v1/browse/products'))
      .map((c) => Number(new URL(c).searchParams.get('limit')));
    expect(limits.every((l) => l <= 100)).toBe(true);
  });

  it('de-duplicates a product that appears on two pages (page boundary shifted mid-walk)', async () => {
    const products = catalogue(120);
    mockApi({ products: [...products, products[50]] }); // p51 twice
    const list = await fetchAllSitemapProducts();
    expect(list.filter((p) => p.id === 'p51')).toHaveLength(1);
    expect(list).toHaveLength(120);
  });

  it('an empty catalogue yields a sitemap with no product URLs and no error', async () => {
    mockApi({ products: [] });
    const entries = await sitemap();
    expect(entries.some((e) => /\/[a-z]+\/.*-[a-z0-9]{6}$/.test(e.url))).toBe(false);
    expect(entries.map((e) => e.url)).toContain('https://teka.cd/lubumbashi');
  });

  it('a refused products request rejects the whole sitemap instead of emitting zero products', async () => {
    mockApi({ productsStatus: 400 });
    await expect(sitemap()).rejects.toBeInstanceOf(SitemapSourceError);
  });

  it('a failure on a later page also rejects (no misleading partial list)', async () => {
    mockApi({ products: catalogue(250), failProductsPage: 1 });
    await expect(sitemap()).rejects.toThrow(/HTTP 500/);
  });

  it('refuses to truncate past the page cap and names the remedy', async () => {
    // Every page says "more" with a fresh cursor → the walk must stop at the cap.
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = new URL(url);
        if (u.pathname.endsWith('/v1/browse/products')) {
          n += 1;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: { data: [{ id: `x${n}`, citySlug: 'lubumbashi', shortCode: 'aaaaaa' }], pagination: { nextCursor: `x${n}`, hasMore: true } },
            }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
      }),
    );
    await expect(fetchAllSitemapProducts()).rejects.toThrow(/generateSitemaps/);
    expect(n).toBe(MAX_PRODUCT_PAGES);
  });
});

describe('sitemap — lastmod semantics', () => {
  it('products carry their real updatedAt; a missing or malformed date is omitted, never faked', async () => {
    mockApi({
      products: [
        { id: 'p1', slug: 'a', shortCode: 'a1b2c3', citySlug: 'lubumbashi', updatedAt: '2026-09-03T10:00:00.000Z' },
        { id: 'p2', slug: 'b', shortCode: 'd4e5f6', citySlug: 'lubumbashi', updatedAt: null },
        { id: 'p3', slug: 'c', shortCode: 'g7h8i9', citySlug: 'lubumbashi', updatedAt: 'not-a-date' },
      ],
    });
    const entries = await sitemap();
    const byUrl = new Map(entries.map((e) => [e.url, e]));
    expect(byUrl.get('https://teka.cd/lubumbashi/a-a1b2c3')?.lastModified).toEqual(
      new Date('2026-09-03T10:00:00.000Z'),
    );
    expect(byUrl.get('https://teka.cd/lubumbashi/b-d4e5f6')?.lastModified).toBeUndefined();
    expect(byUrl.get('https://teka.cd/lubumbashi/c-g7h8i9')?.lastModified).toBeUndefined();
  });

  it('town, category, static and root URLs carry no lastmod (no trustworthy change date exists)', async () => {
    const entries = await sitemap();
    for (const url of [
      'https://teka.cd/',
      'https://teka.cd/a-propos',
      'https://teka.cd/lubumbashi',
      'https://teka.cd/lubumbashi/categorie/telephones',
    ]) {
      expect(entries.find((e) => e.url === url)?.lastModified).toBeUndefined();
    }
  });

  it('emits each URL exactly once', async () => {
    mockApi({ products: catalogue(150) });
    const urls = (await sitemap()).map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
