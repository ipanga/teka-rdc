import type { MetadataRoute } from 'next';
import { PAGE_DEFINITIONS } from '@/lib/static-pages';
import { productHref, categoryHref, cityHref } from '@/lib/urls';

const BASE_URL = 'https://teka.cd';
const API_BASE = process.env.API_INTERNAL_URL || 'http://localhost:5050/api';

/**
 * Product enumeration (SEO-1, 2026-09-08). The browse API caps `limit` at 100
 * and paginates with a cursor (the last product id of the page); the previous
 * single `?limit=500` request was refused with a 400 that `fetchApi` turned
 * into "no products", so the live sitemap listed zero of them. We now walk
 * the cursor until `hasMore` is false.
 *
 * Bound: PRODUCT_PAGE_LIMIT × MAX_PRODUCT_PAGES products per sitemap. When the
 * catalogue approaches it the build must move to `generateSitemaps()` (one
 * file per 5 000 URLs) rather than raise the cap — Google reads at most
 * 50 000 URLs / 50 MB per sitemap file, and the walk below is sequential
 * (one API round-trip per page, cached for SITEMAP_REVALIDATE_SECONDS).
 */
export const PRODUCT_PAGE_LIMIT = 100;
export const MAX_PRODUCT_PAGES = 50;
/** Sitemap fetches are cached by Next for this long (three catalogue calls + one per product page). */
export const SITEMAP_REVALIDATE_SECONDS = 3600;

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

export class SitemapSourceError extends Error {
  constructor(path: string, detail: string) {
    super(`sitemap: ${path} — ${detail}`);
    this.name = 'SitemapSourceError';
  }
}

/**
 * Fetch one API resource for the sitemap. Deliberately STRICT: a refused or
 * unreachable source throws, so the whole sitemap answers 500 and search
 * engines keep their last good copy, instead of being served a smaller
 * sitemap that silently drops every product (the pre-SEO-1 failure mode:
 * `if (!res.ok) return null` → "0 products").
 */
async function fetchApi<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      next: { revalidate: SITEMAP_REVALIDATE_SECONDS },
    });
  } catch (err) {
    throw new SitemapSourceError(path, `unreachable (${(err as Error).message})`);
  }
  if (!res.ok) throw new SitemapSourceError(path, `HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T };
  if (json.data === undefined) throw new SitemapSourceError(path, 'no data field');
  return json.data;
}

interface SitemapCategory {
  id: string;
  slug: string | null;
  subcategories?: SitemapCategory[];
}
interface SitemapCity {
  id: string;
  slug: string | null;
  isActive?: boolean;
}
export interface SitemapProduct {
  id: string;
  slug?: string | null;
  shortCode?: string | null;
  citySlug?: string | null;
  updatedAt?: string | null;
}
interface ProductPage {
  data: SitemapProduct[];
  pagination?: { nextCursor: string | null; hasMore: boolean };
}

/**
 * Every indexable product, walking the browse API's cursor. The endpoint
 * already applies the indexability rules (ACTIVE, not deleted, demo
 * retirement) — nothing is re-decided here. Products are de-duplicated by id
 * in case a page boundary shifts while the walk is in progress.
 */
export async function fetchAllSitemapProducts(): Promise<SitemapProduct[]> {
  const byId = new Map<string, SitemapProduct>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PRODUCT_PAGES; page++) {
    const qs = new URLSearchParams({ limit: String(PRODUCT_PAGE_LIMIT) });
    if (cursor) qs.set('cursor', cursor);
    const path = `/v1/browse/products?${qs.toString()}`;
    const res = await fetchApi<ProductPage | SitemapProduct[]>(path);
    const items = Array.isArray(res) ? res : res.data ?? [];
    for (const p of items) if (p?.id && !byId.has(p.id)) byId.set(p.id, p);
    const pagination = Array.isArray(res) ? undefined : res.pagination;
    if (!pagination?.hasMore || !pagination.nextCursor) return [...byId.values()];
    if (pagination.nextCursor === cursor) {
      throw new SitemapSourceError(path, 'cursor did not advance');
    }
    cursor = pagination.nextCursor;
  }
  throw new SitemapSourceError(
    '/v1/browse/products',
    `more than ${PRODUCT_PAGE_LIMIT * MAX_PRODUCT_PAGES} products — split the sitemap with generateSitemaps()`,
  );
}

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t) : undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // `lastModified` is only emitted where the application has a real change
  // date (products: `updatedAt`). Static, town and category URLs have none,
  // so they carry no lastmod rather than a fabricated generation timestamp
  // that told crawlers every page changed every hour.

  // -- Home + top-level browse pages (no /recherche: it is noindex) --
  const rootPages: MetadataRoute.Sitemap = [
    { url: urlFor('/'), changeFrequency: 'daily', priority: 1.0 },
    { url: urlFor('/categories'), changeFrequency: 'weekly', priority: 0.9 },
    { url: urlFor('/promotions'), changeFrequency: 'daily', priority: 0.7 },
  ];

  // -- Static content pages — French slugs (about → /a-propos etc.) --
  const contentPages: MetadataRoute.Sitemap = PAGE_DEFINITIONS.map((page) => ({
    url: urlFor(`/${page.urlSlug}`),
    changeFrequency: 'monthly',
    priority: page.canonical === 'contact' || page.canonical === 'help' ? 0.7 : 0.5,
  }));

  // Fetch the building blocks in parallel; any failure rejects the sitemap.
  const [categories, cities, products] = await Promise.all([
    fetchApi<SitemapCategory[]>('/v1/browse/categories'),
    fetchApi<SitemapCity[]>('/v1/cities'),
    fetchAllSitemapProducts(),
  ]);

  const activeCities = (cities || []).filter((c) => c.isActive !== false && c.slug);

  // -- City landing pages (/{ville}) --
  const cityPages: MetadataRoute.Sitemap = activeCities.map((city) => ({
    url: urlFor(cityHref(city.slug as string)),
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  // -- City-scoped categories (/{ville}/categorie/{slug}) — per D1 the canonical
  //    category page is city-scoped, so emit categories × active cities. --
  // Flatten ALL levels (category → subcategory → product type) so every node's
  // city-scoped listing page is in the sitemap. Empty town × category pages are
  // still listed — their policy is an open SEO-2 decision (pre-scale tracker,
  // decision 5), not something the sitemap decides on its own.
  const flattenCats = (cats: SitemapCategory[]): SitemapCategory[] =>
    cats.flatMap((c) => [c, ...flattenCats(c.subcategories || [])]);
  const flatCategories: SitemapCategory[] = flattenCats(categories || []);
  const categoryPages: MetadataRoute.Sitemap = activeCities.flatMap((city) =>
    flatCategories
      .filter((cat) => cat.slug)
      .map((cat) => ({
        url: urlFor(categoryHref(city.slug, cat)),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
  );

  // -- Products (/{citySlug}/{slug}-{shortCode}). Only list products that have
  //    a city slug, so every sitemap URL is canonical (no 308 hop), AND a
  //    shortCode: the route resolves a product by the URL tail, so a row
  //    without one (a pre-2026-06-06 row the backfill never reached — seen on
  //    the dev DB, whose slug even ends in a code-shaped suffix) would be
  //    listed as a URL that 404s. Such rows are a data repair, not a URL. --
  const productPages: MetadataRoute.Sitemap = products
    .filter((p) => p.citySlug && p.shortCode)
    .map((p) => {
      const lastModified = parseDate(p.updatedAt);
      return {
        url: urlFor(
          productHref({
            id: p.id,
            slug: p.slug,
            shortCode: p.shortCode,
            citySlug: p.citySlug,
          }),
        ),
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      };
    });

  // One URL once: the builders are deterministic, but guard the invariant
  // (a duplicated product or category slug must not become two entries).
  const seen = new Set<string>();
  return [
    ...rootPages,
    ...contentPages,
    ...cityPages,
    ...categoryPages,
    ...productPages,
  ].filter((entry) => (seen.has(entry.url) ? false : (seen.add(entry.url), true)));
}
