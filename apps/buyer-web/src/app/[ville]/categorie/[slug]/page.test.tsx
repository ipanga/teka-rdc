/** SEO-1 — the category route: title template, canonical, and server-rendered first page. */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const serverFetch = vi.fn();
vi.mock('@/lib/server-api', () => ({ serverFetch: (...a: unknown[]) => serverFetch(...a) }));
const apiFetch = vi.fn((..._a: unknown[]) => new Promise(() => {}));
vi.mock('@/lib/api-client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), trackSearch: vi.fn() }));
// The client component reads `{ville}` from the route params (Next supplies
// them during the server pass); the mock follows the params of each test.
let routeVille = 'lubumbashi';
vi.mock('next/navigation', () => ({
  useParams: () => ({ ville: routeVille, slug: 'smartphones' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));

import Page, { generateMetadata } from './page';

const cities = [
  { id: 'c1', name: 'Lubumbashi', slug: 'lubumbashi', province: 'Haut-Katanga', isActive: true, sortOrder: 1 },
  { id: 'c2', name: 'Kolwezi', slug: 'kolwezi', province: 'Lualaba', isActive: true, sortOrder: 2 },
];
const category = {
  id: 'cat-smart', slug: 'smartphones', name: 'Smartphones', productCount: 40,
  breadcrumb: [{ id: 'cat-elec', slug: 'telephones-et-electronique', name: 'Téléphones & Électronique' }, { id: 'cat-smart', slug: 'smartphones', name: 'Smartphones' }],
  subcategories: [{ id: 'cat-and', slug: 'android', name: 'Android' }],
};
const seller = { id: 's1', businessName: 'Maison Kabila', verified: true, official: false };
const products = Array.from({ length: 12 }, (_, i) => ({
  id: `p${i}`, slug: `tel-${i}`, shortCode: `s${i}`, title: `Téléphone ${i}`, priceCDF: '1000000',
  condition: 'NEW', quantity: 1, image: null, seller, categoryId: 'cat-smart', citySlug: 'lubumbashi',
}));

const params = Promise.resolve({ ville: 'lubumbashi', slug: 'smartphones' });

beforeEach(() => {
  serverFetch.mockReset();
  apiFetch.mockClear();
  serverFetch.mockImplementation(async (path: string) => {
    if (path === '/v1/cities') return cities;
    // Town-scoped detail (SEO-2): the count depends on the town in the query.
    if (path === '/v1/browse/categories/smartphones?cityId=c1') return category;
    if (path === '/v1/browse/categories/smartphones?cityId=c2') return { ...category, productCount: 0 };
    if (path.startsWith('/v1/browse/products?')) return { data: products, pagination: { nextCursor: 'p11', hasMore: true, total: 40 } };
    return null;
  });
});

describe('category route — empty town × category (SEO-2 decision 1)', () => {
  const kolwezi = Promise.resolve({ ville: 'kolwezi', slug: 'smartphones' });

  it('asks the API for the TOWN-scoped count, never the global one', async () => {
    await generateMetadata({ params });
    const calls = serverFetch.mock.calls.map(([p]) => String(p));
    expect(calls).toContain('/v1/browse/categories/smartphones?cityId=c1');
    expect(calls.some((p) => p === '/v1/browse/categories/smartphones')).toBe(false);
  });

  it('populated in the town → index, follow', async () => {
    const meta = await generateMetadata({ params });
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it('products globally but none in this town → noindex, follow; still self-canonical; still renders', async () => {
    const meta = await generateMetadata({ params: kolwezi });
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBe('/kolwezi/categorie/smartphones');
    expect(meta.title).toBe('Smartphones à Kolwezi — Acheter en ligne');
    // No redirect, no 404: the page renders with its heading, sub-category
    // links and footer towns (followable), over the empty state.
    serverFetch.mockImplementation(async (path: string) => {
      if (path === '/v1/cities') return cities;
      if (path.startsWith('/v1/browse/categories/smartphones?cityId=c2')) return { ...category, productCount: 0 };
      if (path.startsWith('/v1/browse/products?')) return { data: [], pagination: { nextCursor: null, hasMore: false, total: 0 } };
      return null;
    });
    routeVille = 'kolwezi';
    let html = '';
    try {
      html = renderToStaticMarkup(await Page({ params: kolwezi }));
    } finally {
      routeVille = 'lubumbashi';
    }
    expect(html).toMatch(/<h1[^>]*>Smartphones<\/h1>/);
    expect(html).toContain('href="/kolwezi/categorie/android"');
    expect(html).toContain('href="/lubumbashi"');
    expect(html).toContain('Aucun produit trouvé.');
    expect(html).not.toMatch(/href="\/kolwezi\/tel-/);
  });

  it('exactly one eligible product in the town → indexable', async () => {
    serverFetch.mockImplementation(async (path: string) => {
      if (path === '/v1/cities') return cities;
      if (path.startsWith('/v1/browse/categories/smartphones?cityId=c2')) return { ...category, productCount: 1 };
      return null;
    });
    const meta = await generateMetadata({ params: kolwezi });
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it('flips with inventory: 0 → 2 becomes indexable, 2 → 0 becomes noindex (same route, no code change)', async () => {
    let count = 0;
    serverFetch.mockImplementation(async (path: string) => {
      if (path === '/v1/cities') return cities;
      if (path.startsWith('/v1/browse/categories/smartphones?cityId=c2')) return { ...category, productCount: count };
      return null;
    });
    expect((await generateMetadata({ params: kolwezi })).robots).toEqual({ index: false, follow: true });
    count = 2;
    expect((await generateMetadata({ params: kolwezi })).robots).toEqual({ index: true, follow: true });
    count = 0;
    expect((await generateMetadata({ params: kolwezi })).robots).toEqual({ index: false, follow: true });
  });
});

describe('category route (SEO-1)', () => {
  it('title has no duplicated brand (layout template adds « | Teka RDC ») and canonical is the city URL', async () => {
    const meta = await generateMetadata({ params });
    expect(meta.title).toBe('Smartphones à Lubumbashi — Acheter en ligne');
    expect(String(meta.title)).not.toContain('Teka RDC');
    expect(meta.alternates?.canonical).toBe('/lubumbashi/categorie/smartphones');
  });

  it('server-renders the first page: h1, 12 product links, sub-category and breadcrumb links, footer towns', async () => {
    const html = renderToStaticMarkup(await Page({ params }));
    expect(html).toMatch(/<h1[^>]*>Smartphones<\/h1>/);
    for (let i = 0; i < 12; i++) expect(html).toContain(`href="/lubumbashi/tel-${i}-s${i}"`);
    expect(html).toContain('href="/lubumbashi/categorie/android"');
    expect(html).toContain('href="/lubumbashi/categorie/telephones-et-electronique"');
    expect(html).toContain('href="/kolwezi"');
    expect(html).not.toContain('animate-pulse');
    expect(apiFetch).not.toHaveBeenCalled();
    // The first page is requested with the town and the client's exact query.
    const listCall = serverFetch.mock.calls.map(([p]) => String(p)).find((p) => p.startsWith('/v1/browse/products?'));
    expect(listCall).toBe('/v1/browse/products?categoryId=cat-smart&sortBy=newest&limit=12&cityId=c1');
  });

  it('404s for an unknown town or category', async () => {
    await expect(Page({ params: Promise.resolve({ ville: 'likasi', slug: 'smartphones' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(Page({ params: Promise.resolve({ ville: 'lubumbashi', slug: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
