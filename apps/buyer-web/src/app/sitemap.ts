import type { MetadataRoute } from 'next';
import { PAGE_DEFINITIONS } from '@/lib/static-pages';
import { productHref, categoryHref, cityHref } from '@/lib/urls';

const BASE_URL = 'https://teka.cd';
const API_BASE = process.env.API_INTERNAL_URL || 'http://localhost:5050/api';

/**
 * Build an absolute Teka URL from a relative path. Site is monolingual
 * (FR-only) since 2026-04-25; URLs have no locale prefix. City-first since
 * 2026-06-06 — paths come from the shared builders in lib/urls.ts so the
 * sitemap always matches the live canonical URLs.
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

interface SitemapCategory {
  id: string;
  slug: string | null;
  subcategories?: Array<{ id: string; slug: string | null }>;
}
interface SitemapCity {
  id: string;
  slug: string | null;
  isActive?: boolean;
}
interface SitemapProduct {
  id: string;
  slug?: string | null;
  shortCode?: string | null;
  citySlug?: string | null;
  updatedAt?: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // -- Home + top-level browse pages --
  const rootPages: MetadataRoute.Sitemap = [
    { url: urlFor('/'), lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: urlFor('/categories'), lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: urlFor('/recherche'), lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
  ];

  // -- Static content pages — French slugs (about → /a-propos etc.) --
  const contentPages: MetadataRoute.Sitemap = PAGE_DEFINITIONS.map((page) => ({
    url: urlFor(`/${page.urlSlug}`),
    lastModified: now,
    changeFrequency: 'monthly',
    priority: page.canonical === 'contact' || page.canonical === 'help' ? 0.7 : 0.5,
  }));

  // Fetch the building blocks in parallel.
  const [categories, cities, products] = await Promise.all([
    fetchApi<SitemapCategory[]>('/v1/browse/categories'),
    fetchApi<SitemapCity[]>('/v1/cities'),
    fetchApi<SitemapProduct[] | { data: SitemapProduct[] }>(
      '/v1/browse/products?limit=500',
    ),
  ]);

  const activeCities = (cities || []).filter((c) => c.isActive !== false && c.slug);

  // -- City landing pages (/{ville}) --
  const cityPages: MetadataRoute.Sitemap = activeCities.map((city) => ({
    url: urlFor(cityHref(city.slug as string)),
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  // -- City-scoped categories (/{ville}/categorie/{slug}) — per D1 the canonical
  //    category page is city-scoped, so emit categories × active cities. --
  const flatCategories: SitemapCategory[] = (categories || []).flatMap((cat) => [
    cat,
    ...(cat.subcategories || []).map((s) => ({ id: s.id, slug: s.slug })),
  ]);
  const categoryPages: MetadataRoute.Sitemap = activeCities.flatMap((city) =>
    flatCategories
      .filter((cat) => cat.slug)
      .map((cat) => ({
        url: urlFor(categoryHref(city.slug, cat)),
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
  );

  // -- Products (/{citySlug}/{slug}-{shortCode}). Only list products that have
  //    a city slug, so every sitemap URL is canonical (no 308 hop). --
  const productItems = products
    ? Array.isArray(products)
      ? products
      : products.data || []
    : [];
  const productPages: MetadataRoute.Sitemap = productItems
    .filter((p) => p.citySlug)
    .map((p) => ({
      url: urlFor(
        productHref({
          id: p.id,
          slug: p.slug,
          shortCode: p.shortCode,
          citySlug: p.citySlug,
        }),
      ),
      lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

  return [
    ...rootPages,
    ...contentPages,
    ...cityPages,
    ...categoryPages,
    ...productPages,
  ];
}
