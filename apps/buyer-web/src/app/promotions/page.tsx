import type { Metadata } from 'next';
import PromotionsPage from '@/components/pages/promotions-page';
import { getActiveCities } from '@/lib/server-cities';
import { deliveryPhrase } from '@/lib/service-area';

export async function generateMetadata(): Promise<Metadata> {
  // Served towns from the active-town API (SEO-2 decision 2).
  const towns = await getActiveCities();
  const title = 'Promotions — Teka RDC';
  const description = `Découvrez tous les produits en promotion sur Teka RDC : smartphones, électroménager, mode et plus à prix réduit. ${deliveryPhrase(towns)}`;

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
    alternates: { canonical: '/promotions' },
  };
}

export default function Page() {
  return <PromotionsPage />;
}
