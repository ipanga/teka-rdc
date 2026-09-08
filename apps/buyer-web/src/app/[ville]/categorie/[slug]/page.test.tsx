/** SEO-1 — the category route: title template, canonical, and server-rendered first page. */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const serverFetch = vi.fn();
vi.mock('@/lib/server-api', () => ({ serverFetch: (...a: unknown[]) => serverFetch(...a) }));
const apiFetch = vi.fn((..._a: unknown[]) => new Promise(() => {}));
vi.mock('@/lib/api-client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), trackSearch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ ville: 'lubumbashi', slug: 'smartphones' }),
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
    if (path === '/v1/browse/categories/smartphones') return category;
    if (path.startsWith('/v1/browse/products?')) return { data: products, pagination: { nextCursor: 'p11', hasMore: true, total: 40 } };
    return null;
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
