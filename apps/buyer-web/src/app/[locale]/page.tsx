import type { Metadata } from 'next';
import HomePage from '@/components/pages/home-page';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'fr'
    ? 'Teka RDC — Achetez en ligne en RD Congo'
    : 'Teka RDC — Shop Online in DR Congo';
  const description = locale === 'fr'
    ? 'Marketplace en ligne pour la RD Congo. Produits de qualité livrés à Lubumbashi, Likasi et Kolwezi.'
    : 'Online marketplace for DR Congo. Quality products delivered to Lubumbashi, Likasi, and Kolwezi.';

  return {
    title,
    description,
    openGraph: { title, description, url: 'https://teka.cd', siteName: 'Teka RDC', locale: locale === 'fr' ? 'fr_CD' : 'en_CD', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: '/', languages: { fr: '/fr', en: '/en' } },
  };
}

export default function Page() {
  return <HomePage />;
}
