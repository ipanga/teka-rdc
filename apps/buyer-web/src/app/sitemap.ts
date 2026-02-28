import type { MetadataRoute } from 'next';

const BASE_URL = 'https://teka.cd';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/fr`, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/en`, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/fr/categories`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/en/categories`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
  ];

  // Content pages
  const slugs = ['faq', 'terms', 'privacy', 'help', 'about'];
  const contentPages: MetadataRoute.Sitemap = slugs.flatMap(slug => [
    { url: `${BASE_URL}/fr/pages/${slug}`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${BASE_URL}/en/pages/${slug}`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.5 },
  ]);

  // Dynamic products
  let productPages: MetadataRoute.Sitemap = [];
  try {
    const API_BASE = process.env.API_INTERNAL_URL || 'http://localhost:5050/api';
    const res = await fetch(`${API_BASE}/v1/browse/products?limit=100`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const json = await res.json();
      const products = json.data?.data || [];
      productPages = products.flatMap((p: { id: string; updatedAt?: string }) => [
        { url: `${BASE_URL}/fr/products/${p.id}`, lastModified: p.updatedAt ? new Date(p.updatedAt) : new Date(), changeFrequency: 'weekly' as const, priority: 0.7 },
        { url: `${BASE_URL}/en/products/${p.id}`, lastModified: p.updatedAt ? new Date(p.updatedAt) : new Date(), changeFrequency: 'weekly' as const, priority: 0.7 },
      ]);
    }
  } catch {
    // Sitemap generation should not fail if API is down
  }

  return [...staticPages, ...contentPages, ...productPages];
}
