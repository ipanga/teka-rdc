/**
 * SEO-1 — the product route: metadata + the server-rendered document (JSON-LD,
 * Open Graph product tags, and the crawlable product body).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const serverFetch = vi.fn();
vi.mock('@/lib/server-api', () => ({ serverFetch: (...a: unknown[]) => serverFetch(...a) }));
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(() => new Promise(() => {})) }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), trackSearch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  permanentRedirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
}));

import Page, { generateMetadata } from './page';

const cities = [
  { id: 'c1', name: 'Lubumbashi', slug: 'lubumbashi', province: 'Haut-Katanga', isActive: true, sortOrder: 1 },
  { id: 'c2', name: 'Kolwezi', slug: 'kolwezi', province: 'Lualaba', isActive: true, sortOrder: 2 },
];

const product = {
  id: 'p1', slug: 'samsung-galaxy-a15', shortCode: 'k7x2', title: 'Samsung Galaxy A15',
  description: '# Fiche\n\nÉcran **6,5"** — [garantie](https://x) 12 mois.\n\n- 128 Go',
  priceCDF: '30000000', discountPriceCDF: '25000000', priceUSD: 100,
  condition: 'NEW', quantity: 2, updatedAt: '2026-09-01T10:00:00.000Z',
  images: [
    { id: 'i1', url: 'https://res.cloudinary.com/teka/image/upload/v1/a.jpg', thumbnailUrl: 'https://res.cloudinary.com/teka/a-t.jpg', isPrimary: true, sortOrder: 0 },
    { id: 'i2', url: 'https://res.cloudinary.com/teka/image/upload/v1/b.jpg', thumbnailUrl: 'https://res.cloudinary.com/teka/b-t.jpg', isPrimary: false, sortOrder: 1 },
  ],
  seller: { id: 's1', businessName: 'Maison Kabila', verified: true, official: false },
  categoryId: 'cat-smart', brand: { id: 'b1', name: 'Samsung' },
  city: { id: 'c1', slug: 'lubumbashi', name: 'Lubumbashi', province: 'Haut-Katanga' },
  category: { id: 'cat-smart', slug: 'smartphones', name: 'Smartphones' },
  breadcrumb: [
    { id: 'cat-elec', slug: 'telephones-et-electronique', name: 'Téléphones & Électronique' },
    { id: 'cat-smart', slug: 'smartphones', name: 'Smartphones' },
  ],
  specifications: [], avgRating: 4.5, totalReviews: 0,
};

const params = Promise.resolve({ ville: 'lubumbashi', product: 'samsung-galaxy-a15-k7x2' });

function jsonLdBlocks(html: string): Record<string, unknown>[] {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const out: Record<string, unknown>[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(JSON.parse(m[1]));
  return out;
}

beforeEach(() => {
  serverFetch.mockReset();
  serverFetch.mockImplementation(async (path: string) => {
    if (path === '/v1/cities') return cities;
    if (path.startsWith('/v1/browse/products/')) return product;
    return null;
  });
});

describe('generateMetadata — product (SEO-1)', () => {
  it('uses the effective price, a plain-text description, the canonical city URL and no og:type', async () => {
    const meta = await generateMetadata({ params });
    // fr-CD number formatting uses U+202F (narrow no-break space) as the thousands separator.
    expect(meta.title).toBe('Samsung Galaxy A15 - 250\u202f000 FC à Lubumbashi');
    expect(meta.description).not.toMatch(/[#*\[\]]/);
    expect(meta.description).toContain('Écran 6,5" — garantie 12 mois.');
    expect(String(meta.description).length).toBeLessThanOrEqual(160);
    expect(meta.alternates?.canonical).toBe('/lubumbashi/samsung-galaxy-a15-k7x2');
    const og = meta.openGraph as Record<string, unknown>;
    expect(og.url).toBe('https://teka.cd/lubumbashi/samsung-galaxy-a15-k7x2');
    expect('type' in og).toBe(false);
    expect((og.images as { url: string }[])[0].url).toContain('c_pad,w_1200,h_630,b_white');
  });
});

describe('product page document (SEO-1)', () => {
  it('emits Product + BreadcrumbList JSON-LD with all images, plain description and the effective price', async () => {
    const html = renderToStaticMarkup(await Page({ params }));
    const [productLd, breadcrumbLd] = jsonLdBlocks(html);
    expect(productLd['@type']).toBe('Product');
    expect(productLd.image).toEqual(['https://res.cloudinary.com/teka/image/upload/v1/a.jpg', 'https://res.cloudinary.com/teka/image/upload/v1/b.jpg']);
    expect(productLd.description).toBe('Fiche Écran 6,5" — garantie 12 mois. 128 Go');
    expect(productLd.brand).toEqual({ '@type': 'Brand', name: 'Samsung' });
    const offers = productLd.offers as Record<string, unknown>;
    expect(offers.price).toBe('250000');
    expect(offers.priceCurrency).toBe('CDF');
    expect(offers.availability).toBe('https://schema.org/InStock');
    expect(offers.url).toBe('https://teka.cd/lubumbashi/samsung-galaxy-a15-k7x2');
    // No rating block without reviews (would be invalid rich-result data).
    expect('aggregateRating' in productLd).toBe(false);

    expect(breadcrumbLd['@type']).toBe('BreadcrumbList');
    const items = breadcrumbLd.itemListElement as { name: string; item?: string }[];
    expect(items.map((i) => i.name)).toEqual(['Accueil', 'Lubumbashi', 'Téléphones & Électronique', 'Smartphones', 'Samsung Galaxy A15']);
    expect(items[3].item).toBe('https://teka.cd/lubumbashi/categorie/smartphones');
  });

  it('emits exactly one og:type (product) plus price tags, and keeps the JSON-LD escaped', async () => {
    serverFetch.mockImplementation(async (path: string) => {
      if (path === '/v1/cities') return cities;
      return { ...product, title: 'Câble </script><b>x' };
    });
    const html = renderToStaticMarkup(await Page({ params }));
    expect(html.match(/property="og:type"/g)).toHaveLength(1);
    expect(html).toContain('<meta property="og:type" content="product"/>');
    expect(html).toContain('<meta property="product:price:amount" content="250000.00"/>');
    expect(html).toContain('<meta property="product:price:currency" content="CDF"/>');
    expect(html).toContain('<meta property="og:availability" content="instock"/>');
    expect(html).toContain('property="og:updated_time"');
    // The closing tag inside the title must never break out of the JSON-LD script.
    expect(html).not.toContain('</script><b>x');
    expect(html).toContain('\\u003c/script\\u003e');
  });

  it('renders the product body server-side: h1, price, city-scoped links, footer towns', async () => {
    const html = renderToStaticMarkup(await Page({ params }));
    expect(html).toMatch(/<h1[^>]*>Samsung Galaxy A15<\/h1>/);
    expect(html).toContain('href="/lubumbashi/categorie/smartphones"');
    expect(html).toContain('href="/kolwezi"');
    expect(html).toContain('Maison Kabila');
    // One product fetch + one cities fetch: no duplicate product request.
    const productCalls = serverFetch.mock.calls.filter(([p]) => String(p).startsWith('/v1/browse/products/'));
    expect(productCalls).toHaveLength(1);
  });

  it('redirects (308) a wrong-town or stale-slug URL to the canonical one', async () => {
    await expect(
      Page({ params: Promise.resolve({ ville: 'kolwezi', product: 'samsung-galaxy-a15-k7x2' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/lubumbashi/samsung-galaxy-a15-k7x2');
    await expect(
      Page({ params: Promise.resolve({ ville: 'lubumbashi', product: 'old-slug-k7x2' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/lubumbashi/samsung-galaxy-a15-k7x2');
  });

  it('404s when the product does not exist', async () => {
    serverFetch.mockImplementation(async (path: string) => (path === '/v1/cities' ? cities : null));
    await expect(Page({ params })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
