import type { Metadata } from 'next';
import CategoriesPage from '@/components/pages/categories-page';
import { serverFetch } from '@/lib/server-api';
import { getActiveCities } from '@/lib/server-cities';
import { deliveryPhrase } from '@/lib/service-area';
import type { BrowseCategory } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  // Served towns from the active-town API (SEO-2 decision 2).
  const towns = await getActiveCities();
  const title = 'Toutes les catégories — Teka RDC';
  const description = `Parcourez toutes les catégories de produits sur Teka RDC : smartphones, vêtements, maison, beauté et plus. ${deliveryPhrase(towns)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'Teka RDC',
      type: 'website',
      locale: 'fr_CD',
      images: [
        {
          url: 'https://teka.cd/og-default.png',
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    alternates: { canonical: '/categories' },
  };
}

export default async function Page() {
  // SEO-2: the hub is in the sitemap at priority 0.9 but rendered nothing a
  // crawler could read (client fetch). Same pattern as the other pages: the
  // tree and the towns come from the server, the client fetch is skipped.
  const [categories, cities] = await Promise.all([
    serverFetch<BrowseCategory[]>('/v1/browse/categories'),
    getActiveCities(),
  ]);
  return <CategoriesPage initialCategories={categories ?? undefined} initialCities={cities} />;
}
