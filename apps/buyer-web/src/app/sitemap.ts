import type { MetadataRoute } from 'next';
import { PAGE_DEFINITIONS, type Locale } from '@/lib/static-pages';

const BASE_URL = 'https://teka.cd';
const API_BASE = process.env.API_INTERNAL_URL || 'http://localhost:5050/api';

const LOCALES: ReadonlyArray<Locale> = ['fr', 'en'];

/**
 * Build a Teka URL for a given locale + path. Default locale (FR) has no
 * `/fr/` prefix because next-intl is configured with `localePrefix: 'as-needed'`.
 */
function urlFor(locale: Locale, path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (locale === 'fr') return `${BASE_URL}${cleanPath}`;
  return `${BASE_URL}/${locale}${cleanPath}`;
}

async function fetchApi<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data as T;
  } catch {
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // -- Home + top-level browse pages --
  const rootPages: MetadataRoute.Sitemap = LOCALES.flatMap((locale) => [
    {
      url: urlFor(locale, '/'),
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 1.0,
    },
    {
      url: urlFor(locale, '/categories'),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    {
      url: urlFor(locale, '/search'),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    },
  ]);

  // -- Static content pages — locale-aware French slugs (about → /a-propos etc.) --
  const contentPages: MetadataRoute.Sitemap = PAGE_DEFINITIONS.flatMap((page) =>
    LOCALES.map((locale) => ({
      url: urlFor(locale, `/${page.urlSlug[locale]}`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: page.canonical === 'contact' || page.canonical === 'help' ? 0.7 : 0.5,
    })),
  );

  // -- Dynamic categories (incl. subcategories) --
  let categoryPages: MetadataRoute.Sitemap = [];
  const categories = await fetchApi<
    Array<{ id: string; subcategories?: Array<{ id: string }> }>
  >('/v1/browse/categories');
  if (categories && Array.isArray(categories)) {
    categoryPages = categories.flatMap((cat) => {
      const main = LOCALES.map((locale) => ({
        url: urlFor(locale, `/categories/${cat.id}`),
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
      const subs = (cat.subcategories || []).flatMap((sub) =>
        LOCALES.map((locale) => ({
          url: urlFor(locale, `/categories/${sub.id}`),
          lastModified: now,
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        })),
      );
      return [...main, ...subs];
    });
  }

  // -- City landing pages (Lubumbashi, Kolwezi, …) --
  let cityPages: MetadataRoute.Sitemap = [];
  const cities = await fetchApi<Array<{ id: string; isActive?: boolean }>>(
    '/v1/cities',
  );
  if (cities && Array.isArray(cities)) {
    cityPages = cities
      .filter((c) => c.isActive !== false)
      .flatMap((city) =>
        LOCALES.map((locale) => ({
          url: urlFor(locale, `/?cityId=${city.id}`),
          lastModified: now,
          changeFrequency: 'daily' as const,
          priority: 0.7,
        })),
      );
  }

  // -- Dynamic products --
  let productPages: MetadataRoute.Sitemap = [];
  const products = await fetchApi<
    | Array<{ id: string; slug?: string; updatedAt?: string }>
    | { data: Array<{ id: string; slug?: string; updatedAt?: string }> }
  >('/v1/browse/products?limit=500');
  if (products) {
    const items = Array.isArray(products) ? products : products.data || [];
    productPages = items.flatMap((p) =>
      LOCALES.map((locale) => ({
        url: urlFor(locale, `/products/${p.slug || p.id}`),
        lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      })),
    );
  }

  return [
    ...rootPages,
    ...contentPages,
    ...categoryPages,
    ...cityPages,
    ...productPages,
  ];
}
