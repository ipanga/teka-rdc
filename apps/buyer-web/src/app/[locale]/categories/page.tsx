import type { Metadata } from 'next';
import CategoriesPage from '@/components/pages/categories-page';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'fr'
    ? 'Toutes les catégories — Teka RDC'
    : 'All Categories — Teka RDC';
  const description = locale === 'fr'
    ? 'Parcourez toutes les catégories de produits sur Teka RDC : smartphones, vêtements, maison, beauté et plus. Livraison à Lubumbashi et Kolwezi.'
    : 'Browse all product categories on Teka RDC: smartphones, clothing, home, beauty and more. Delivery to Lubumbashi and Kolwezi.';

  return {
    title,
    description,
    openGraph: { title, description, siteName: 'Teka RDC', type: 'website', images: [{ url: 'https://teka.cd/og-default.png', width: 1200, height: 630, alt: title }] },
    alternates: {
      canonical: '/categories',
      languages: { fr: '/fr/categories', en: '/en/categories' },
    },
  };
}

export default function Page() {
  return <CategoriesPage />;
}
