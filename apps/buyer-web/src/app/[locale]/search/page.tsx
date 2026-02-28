import type { Metadata } from 'next';
import SearchPage from '@/components/pages/search-page';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { q } = await searchParams;
  const query = q || '';

  const title = query
    ? (locale === 'fr' ? `Recherche : ${query}` : `Search: ${query}`)
    : (locale === 'fr' ? 'Recherche' : 'Search');
  const description = locale === 'fr'
    ? `Résultats de recherche pour "${query}" sur Teka RDC.`
    : `Search results for "${query}" on Teka RDC.`;

  return {
    title,
    description,
    robots: { index: false, follow: true },
  };
}

export default function Page() {
  return <SearchPage />;
}
