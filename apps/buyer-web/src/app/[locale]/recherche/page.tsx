import type { Metadata } from 'next';
import SearchPage from '@/components/pages/search-page';

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const query = q || '';

  const title = query ? `Recherche : ${query}` : 'Recherche';
  const description = `Résultats de recherche pour "${query}" sur Teka RDC.`;

  return {
    title,
    description,
    robots: { index: false, follow: true },
  };
}

export default function Page() {
  return <SearchPage />;
}
