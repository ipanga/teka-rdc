import { notFound, permanentRedirect } from 'next/navigation';
import { serverFetch } from '@/lib/server-api';
import { getDefaultCity } from '@/lib/server-cities';

type Props = { params: Promise<{ id: string }> };

interface ApiCategoryDetail {
  id: string;
  slug: string | null;
}

/**
 * Legacy /categories/<id> route. Categories are city-scoped since 2026-06-06,
 * so this 308-redirects straight to /{defaultCity}/categorie/<slug> (one hop,
 * no chain through the old /categorie/<slug>). Old links keep their equity.
 *
 * 404 if the category has no slug or no city is configured — the city-scoped
 * route is the canonical one.
 */
export default async function Page({ params }: Props) {
  const { id } = await params;
  const [category, city] = await Promise.all([
    serverFetch<ApiCategoryDetail>(`/v1/browse/categories/${id}`),
    getDefaultCity(),
  ]);

  if (!category?.slug || !city?.slug) notFound();

  permanentRedirect(`/${city.slug}/categorie/${category.slug}`);
}
