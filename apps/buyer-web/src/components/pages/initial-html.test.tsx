/**
 * SEO-1 — what a crawler receives in the FIRST HTML.
 *
 * `renderToStaticMarkup` is the server pass: effects never run, so anything a
 * page fetches client-side is absent here — exactly like the HTML Googlebot
 * indexes before (or without) executing JavaScript. Each test therefore
 * asserts two things: the indexable content is present, and NO client fetch
 * was needed to put it there.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Banner, BrowseCategory, BrowseProduct, ProductDetail } from '@/lib/types';
import type { City } from '@/lib/city-store';

const apiFetch = vi.fn((..._a: unknown[]) => new Promise(() => {}));
vi.mock('@/lib/api-client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), trackSearch: vi.fn() }));
// The category page reads `{ville}` from the route params for its links —
// in Next the server pass has them; here they are supplied by the mock.
vi.mock('next/navigation', () => ({
  useParams: () => ({ ville: 'lubumbashi' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import CategoryPage from './category-page';
import CityLandingPage from './city-landing-page';
import HomePage from './home-page';
import ProductDetailPage from './product-detail-page';
import { Footer } from '@/components/layout/footer';
import { useCityStore } from '@/lib/city-store';

const cities: City[] = [
  { id: 'c1', name: 'Lubumbashi', slug: 'lubumbashi', province: 'Haut-Katanga', isActive: true, sortOrder: 1 },
  { id: 'c2', name: 'Kolwezi', slug: 'kolwezi', province: 'Lualaba', isActive: true, sortOrder: 2 },
];

const seller = { id: 's1', businessName: 'Maison Kabila', verified: true, official: false };

function product(n: number): BrowseProduct {
  return {
    id: `p${n}`,
    slug: `produit-${n}`,
    shortCode: `ab${n}`,
    title: `Produit numéro ${n}`,
    priceCDF: String(n * 100_000),
    condition: 'NEW',
    quantity: 3,
    image: { url: `https://res.cloudinary.com/teka/p${n}.jpg`, thumbnailUrl: `https://res.cloudinary.com/teka/p${n}-t.jpg` },
    seller,
    categoryId: 'cat-tel',
    citySlug: 'lubumbashi',
    cityName: 'Lubumbashi',
  };
}

const tree: BrowseCategory[] = [
  {
    id: 'cat-elec', name: 'Téléphones & Électronique', emoji: null, slug: 'telephones-et-electronique',
    parentId: null, productCount: 3,
    subcategories: [
      { id: 'cat-tel', name: 'Téléphones', emoji: null, slug: 'telephones', parentId: 'cat-elec', productCount: 3, subcategories: [] },
    ],
  },
];

beforeEach(() => {
  apiFetch.mockClear();
  useCityStore.setState({ cities: [], selectedCity: null, isLoading: false });
});

describe('category page — initial HTML (SEO-1)', () => {
  const html = () =>
    renderToStaticMarkup(
      <CategoryPage
        categoryUuid="cat-tel"
        cityId="c1"
        initialCategory={{
          id: 'cat-tel', name: 'Téléphones', slug: 'telephones',
          breadcrumb: [{ id: 'cat-elec', name: 'Téléphones & Électronique', slug: 'telephones-et-electronique' }, { id: 'cat-tel', name: 'Téléphones', slug: 'telephones' }],
          subcategories: [{ id: 'cat-smart', name: 'Smartphones', slug: 'smartphones' }],
        }}
        initialProducts={[product(1), product(2)]}
        initialPagination={{ nextCursor: 'p2', hasMore: true, total: 30 }}
        initialCities={cities}
      />,
    );

  it('carries the real <h1>, not the « Catégories » fallback', () => {
    const out = html();
    expect(out).toMatch(/<h1[^>]*>Téléphones<\/h1>/);
    expect(out).not.toMatch(/<h1[^>]*>Catégories<\/h1>/);
  });

  it('holds a real href for every product of the first page and for each sub-category', () => {
    const out = html();
    expect(out).toContain('href="/lubumbashi/produit-1-ab1"');
    expect(out).toContain('href="/lubumbashi/produit-2-ab2"');
    expect(out).toContain('Produit numéro 1');
    expect(out).toContain('href="/lubumbashi/categorie/smartphones"');
    // breadcrumb ancestor
    expect(out).toContain('href="/lubumbashi/categorie/telephones-et-electronique"');
    // footer towns
    expect(out).toContain('href="/kolwezi"');
  });

  it('needs no client fetch for the content, and no skeleton is shown', () => {
    const out = html();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(out).not.toContain('animate-pulse');
  });

  it('without server data it still renders the (client-fetched) shell — behaviour unchanged', () => {
    const out = renderToStaticMarkup(<CategoryPage categoryUuid="cat-tel" cityId="c1" />);
    expect(out).toContain('animate-pulse');
    expect(out).not.toContain('Produit numéro 1');
  });
});

describe('product page — initial HTML (SEO-1)', () => {
  const detail: ProductDetail = {
    id: 'p1', slug: 'produit-1', shortCode: 'ab1', title: 'Produit numéro 1',
    description: '## Génial\n\nUn **super** téléphone.', priceCDF: '25000000', priceUSD: 90,
    condition: 'NEW', quantity: 3,
    images: [{ id: 'i1', url: 'https://res.cloudinary.com/teka/p1.jpg', thumbnailUrl: 'https://res.cloudinary.com/teka/p1-t.jpg', alt: null, position: 0 }],
    seller, categoryId: 'cat-tel',
    city: { id: 'c1', slug: 'lubumbashi', name: 'Lubumbashi', province: 'Haut-Katanga' },
    category: { id: 'cat-tel', slug: 'telephones', name: 'Téléphones' },
    breadcrumb: [{ id: 'cat-elec', slug: 'telephones-et-electronique', name: 'Téléphones & Électronique' }, { id: 'cat-tel', slug: 'telephones', name: 'Téléphones' }],
    specifications: [],
  };

  it('renders title, price, description and city-scoped links without fetching', () => {
    const out = renderToStaticMarkup(
      <ProductDetailPage identifier="ab1" initialProduct={detail} initialCities={cities} />,
    );
    expect(out).toMatch(/<h1[^>]*>Produit numéro 1<\/h1>/);
    expect(out).toContain('250');
    expect(out).toContain('FC');
    expect(out).toContain('super');
    // « Catégorie » row and breadcrumb link to the city-scoped listing
    expect(out).toContain('href="/lubumbashi/categorie/telephones"');
    expect(out).toContain('href="/lubumbashi/categorie/telephones-et-electronique"');
    expect(out).not.toContain('href="/categorie/');
    expect(out).toContain('href="/lubumbashi"');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('with no server product it renders the loading shell only (legacy client path)', () => {
    const out = renderToStaticMarkup(<ProductDetailPage identifier="ab1" />);
    expect(out).not.toContain('Produit numéro 1');
  });
});

describe('town landing — initial HTML (SEO-1)', () => {
  it('renders category links and both product grids for the town without fetching', () => {
    const out = renderToStaticMarkup(
      <CityLandingPage
        cityId="c1" citySlug="lubumbashi" cityName="Lubumbashi" province="Haut-Katanga"
        initialCategories={tree} initialPopular={[product(1)]} initialNewest={[product(2)]} initialCities={cities}
      />,
    );
    expect(out).toContain('href="/lubumbashi/categorie/telephones-et-electronique"');
    expect(out).toContain('href="/lubumbashi/produit-1-ab1"');
    expect(out).toContain('href="/lubumbashi/produit-2-ab2"');
    expect(out).toMatch(/<h1[^>]*>[^<]*Lubumbashi/);
    expect(out).not.toContain('animate-pulse');
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('homepage — initial HTML (SEO-1)', () => {
  const banners: Banner[] = [{ id: 'b1', title: 'Promo', imageUrl: 'https://res.cloudinary.com/teka/b1.jpg', sortOrder: 0 }];

  it('with no banners the hero <h1> is in the first HTML instead of a skeleton', () => {
    const out = renderToStaticMarkup(
      <HomePage serverH1="Teka RDC — Supermarché en ligne en RD Congo" initialCategories={tree} initialBanners={[]} initialCities={cities} />,
    );
    expect(out).toMatch(/<h1[^>]*>Teka RDC — Supermarché en ligne en RD Congo<\/h1>/);
    // The homepage is not town-scoped and the buyer's town is client state, so
    // the server pass emits the town-less category URL — a real, resolvable
    // href that 308s to the default town (see next.config redirects). The
    // town-scoped links live on the /{ville} landing pages and in the footer.
    expect(out).toContain('href="/categorie/telephones-et-electronique"');
    expect(out).toContain('href="/kolwezi"');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('with banners the carousel is rendered server-side (image present, no skeleton)', () => {
    const out = renderToStaticMarkup(
      <HomePage serverH1="Teka RDC" initialCategories={tree} initialBanners={banners} initialCities={cities} />,
    );
    expect(out).toContain('Promo');
    expect(out).not.toMatch(/<h1[^>]*>Teka RDC<\/h1>/);
  });

  it('without server inputs it still renders the legacy skeleton shell', () => {
    const out = renderToStaticMarkup(<HomePage serverH1="Teka RDC" />);
    expect(out).toContain('animate-pulse');
  });
});

describe('footer — town links (SEO-1)', () => {
  it('renders every active town with a real href from the server list; inactive/slugless are skipped', () => {
    const out = renderToStaticMarkup(
      <Footer initialCities={[...cities, { id: 'c3', name: 'Likasi', slug: 'likasi', province: 'Haut-Katanga', isActive: false, sortOrder: 3 }, { id: 'c4', name: 'Sans slug', slug: null, province: 'X', isActive: true, sortOrder: 4 }]} />,
    );
    expect(out).toContain('href="/lubumbashi"');
    expect(out).toContain('href="/kolwezi"');
    expect(out).not.toContain('href="/likasi"');
    expect(out).not.toContain('Sans slug');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('renders no town links without server data (the client fetch fills them in later)', () => {
    const out = renderToStaticMarkup(<Footer />);
    expect(out).not.toContain('href="/lubumbashi"');
  });
});

describe('city store hydration (SEO-1)', () => {
  it('hydrateCities seeds an empty store and never overrides a loaded list', () => {
    useCityStore.getState().hydrateCities(cities);
    expect(useCityStore.getState().cities.map((c) => c.id)).toEqual(['c1', 'c2']);
    useCityStore.getState().hydrateCities([{ ...cities[0], id: 'other' }]);
    expect(useCityStore.getState().cities.map((c) => c.id)).toEqual(['c1', 'c2']);
  });
});
