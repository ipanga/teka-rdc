import type { Metadata } from 'next';
import CategoriesPage from '@/components/pages/categories-page';

export function generateMetadata(): Metadata {
  const title = 'Toutes les catégories — Teka RDC';
  const description =
    'Parcourez toutes les catégories de produits sur Teka RDC : smartphones, vêtements, maison, beauté et plus. Livraison à Lubumbashi et Kolwezi.';

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

export default function Page() {
  return <CategoriesPage />;
}
