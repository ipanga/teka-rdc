import type { MetadataRoute } from 'next';

const BASE_URL = 'https://teka.cd';
const API_BASE = process.env.API_INTERNAL_URL || 'http://localhost:5050/api';

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
  const locales = ['fr', 'en'];

  // Static pages
  const staticPages: MetadataRoute.Sitemap = locales.flatMap(locale => [
    { url: `${BASE_URL}/${locale}`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 1.0 },
    { url: `${BASE_URL}/${locale}/categories`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.9 },
  ]);

  // Content pages
  const contentSlugs = ['faq', 'terms', 'privacy', 'help', 'about', 'contact', 'how-to-buy', 'how-to-sell'];
  const contentPages: MetadataRoute.Sitemap = contentSlugs.flatMap(slug =>
    locales.map(locale => ({
      url: `${BASE_URL}/${locale}/pages/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    }))
  );

  // Dynamic categories (including subcategories)
  let categoryPages: MetadataRoute.Sitemap = [];
  const categories = await fetchApi<Array<{ id: string; subcategories?: Array<{ id: string }> }>>('/v1/browse/categories');
  if (categories && Array.isArray(categories)) {
    categoryPages = categories.flatMap(cat => {
      const pages = locales.map(locale => ({
        url: `${BASE_URL}/${locale}/categories/${cat.id}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
      // Include subcategory pages
      const subPages = (cat.subcategories || []).flatMap(sub =>
        locales.map(locale => ({
          url: `${BASE_URL}/${locale}/categories/${sub.id}`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        }))
      );
      return [...pages, ...subPages];
    });
  }

  // Dynamic products
  let productPages: MetadataRoute.Sitemap = [];
  const products = await fetchApi<{ data: Array<{ id: string; slug?: string; updatedAt?: string }> }>('/v1/browse/products?limit=100');
  if (products) {
    const items = Array.isArray(products) ? products : (products as { data: Array<{ id: string; slug?: string; updatedAt?: string }> }).data || [];
    productPages = items.flatMap((p) =>
      locales.map(locale => ({
        url: `${BASE_URL}/${locale}/products/${p.slug || p.id}`,
        lastModified: p.updatedAt ? new Date(p.updatedAt) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }))
    );
  }

  return [...staticPages, ...contentPages, ...categoryPages, ...productPages];
}
