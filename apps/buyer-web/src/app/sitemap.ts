import type { MetadataRoute } from 'next';
import { PAGE_DEFINITIONS } from '@/lib/static-pages';

const BASE_URL = 'https://teka.cd';
const API_BASE = process.env.API_INTERNAL_URL || 'http://localhost:5050/api';

/**
 * Build a Teka URL. Site is monolingual (FR-only) since 2026-04-25; URLs have
 * no locale prefix.
 */
function urlFor(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_URL}${cleanPath}`;
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
  const rootPages: MetadataRoute.Sitemap = [
    {
      url: urlFor('/'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: urlFor('/categories'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: urlFor('/search'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ];

  // -- Static content pages — French slugs (about → /a-propos etc.) --
  const contentPages: MetadataRoute.Sitemap = PAGE_DEFINITIONS.map((page) => ({
    url: urlFor(`/${page.urlSlug}`),
    lastModified: now,
    changeFrequency: 'monthly',
    priority: page.canonical === 'contact' || page.canonical === 'help' ? 0.7 : 0.5,
  }));

  // -- Dynamic categories (incl. subcategories) --
  let categoryPages: MetadataRoute.Sitemap = [];
  const categories = await fetchApi<
    Array<{
      id: string;
      slug: string | null;
      subcategories?: Array<{ id: string; slug: string | null }>;
    }>
  >('/v1/browse/categories');
  if (categories && Array.isArray(categories)) {
    categoryPages = categories.flatMap((cat) => {
      const main = cat.slug
        ? [
            {
              url: urlFor(`/categorie/${cat.slug}`),
              lastModified: now,
              changeFrequency: 'weekly' as const,
              priority: 0.8,
            },
          ]
        : [];
      const subs = (cat.subcategories || []).flatMap((sub) =>
        sub.slug
          ? [
              {
                url: urlFor(`/categorie/${sub.slug}`),
                lastModified: now,
                changeFrequency: 'weekly' as const,
                priority: 0.7,
              },
            ]
          : [],
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
      .map((city) => ({
        url: urlFor(`/?cityId=${city.id}`),
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.7,
      }));
  }

  // -- Dynamic products --
  let productPages: MetadataRoute.Sitemap = [];
  const products = await fetchApi<
    | Array<{ id: string; slug?: string; updatedAt?: string }>
    | { data: Array<{ id: string; slug?: string; updatedAt?: string }> }
  >('/v1/browse/products?limit=500');
  if (products) {
    const items = Array.isArray(products) ? products : products.data || [];
    productPages = items.map((p) => ({
      url: urlFor(`/products/${p.slug || p.id}`),
      lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));
  }

  return [
    ...rootPages,
    ...contentPages,
    ...categoryPages,
    ...cityPages,
    ...productPages,
  ];
}
