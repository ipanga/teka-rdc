import { notFound, permanentRedirect } from 'next/navigation';
import { getDefaultCity } from '@/lib/server-cities';

// Legacy global category URL. Categories are city-scoped since 2026-06-06, so
// /categorie/{slug} 308-redirects to the default city's scoped page
// (/{defaultCity}/categorie/{slug}). Direct, no chain.
type Props = { params: Promise<{ slug: string }> };

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const city = await getDefaultCity();
  if (!city?.slug) notFound();
  permanentRedirect(`/${city.slug}/categorie/${slug}`);
}
