import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sitemap from './sitemap';

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
const PRODUCTS = {
  data: [
    { id: 'p1', slug: 'iphone-15', shortCode: 'a1b2c3', citySlug: 'lubumbashi' },
    { id: 'p2', slug: 'galaxy', shortCode: 'd4e5f6', citySlug: 'kolwezi' },
    { id: 'p3', slug: 'orphan', shortCode: 'z9z9z9', citySlug: null }, // no city → excluded
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.includes('/v1/cities')
        ? CITIES
        : url.includes('/v1/browse/categories')
          ? CATEGORIES
          : url.includes('/v1/browse/products')
            ? PRODUCTS
            : null;
      return {
        ok: true,
        json: async () => ({ data: body }),
      } as Response;
    }),
  );
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
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain('https://teka.cd/lubumbashi/iphone-15-a1b2c3');
    expect(urls).toContain('https://teka.cd/kolwezi/galaxy-d4e5f6');
    // product without a city is not listed (would be a non-canonical 308 hop)
    expect(urls.some((u) => u.includes('orphan'))).toBe(false);
  });

  it('keeps home + static pages', async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain('https://teka.cd/');
    expect(urls).toContain('https://teka.cd/a-propos');
  });
});
