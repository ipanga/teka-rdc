import type { Metadata } from 'next';
import CategoryPage from '@/components/pages/category-page';
import { serverFetch } from '@/lib/server-api';

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const category = await serverFetch<{ name: Record<string, string> }>(`/v1/browse/categories/${id}`);

  const name = category?.name?.[locale] || category?.name?.fr || '';
  const title = name || 'Teka RDC';
  const description = locale === 'fr'
    ? `Découvrez les produits ${name} sur Teka RDC. Livraison à Lubumbashi, Likasi et Kolwezi.`
    : `Browse ${name} products on Teka RDC. Delivery to Lubumbashi, Likasi, and Kolwezi.`;

  return {
    title,
    description,
    openGraph: { title: `${name} | Teka RDC`, description, siteName: 'Teka RDC', type: 'website' },
    alternates: {
      canonical: `/categories/${id}`,
      languages: { fr: `/fr/categories/${id}`, en: `/en/categories/${id}` },
    },
  };
}

export default function Page() {
  return <CategoryPage />;
}
