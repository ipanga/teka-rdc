import { redirect } from 'next/navigation';
import { serverFetch } from '@/lib/server-api';

type Props = { params: Promise<{ locale: string; id: string }> };

interface ApiCategoryDetail {
  id: string;
  slug: string | null;
}

/**
 * Legacy /categories/<id> route — kept as a 308 redirect to the SEO-friendly
 * /categorie/<slug> URL. Old links (Google, bookmarks, the few external
 * citations from before the slug refactor) keep resolving so we don't lose
 * link equity.
 *
 * If a category somehow has no slug (race during seed, or admin-created
 * category that hasn't been backfilled), we 404 instead of rendering on the
 * legacy URL — the new route is the canonical one.
 */
export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  const category = await serverFetch<ApiCategoryDetail>(
    `/v1/browse/categories/${id}`,
  );

  if (!category?.slug) {
    redirect(locale === 'fr' ? '/' : `/${locale}`);
  }

  const target =
    locale === 'fr'
      ? `/categorie/${category.slug}`
      : `/${locale}/categorie/${category.slug}`;
  redirect(target);
}
