import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CategoryPage from '@/components/pages/category-page';
import { JsonLd } from '@/components/seo/json-ld';
import { serverFetch } from '@/lib/server-api';

type Props = { params: Promise<{ locale: string; slug: string }> };

interface ApiCategoryDetail {
  id: string;
  slug: string | null;
  name: Record<string, string>;
  productCount?: number;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await serverFetch<ApiCategoryDetail>(
    `/v1/browse/categories/${slug}`,
  );

  const name = category?.name?.fr || '';
  const title = `${name} — Acheter en ligne sur Teka RDC`;
  const description = `Découvrez les produits ${name} sur Teka RDC. Livraison rapide à Lubumbashi, Kolwezi et Likasi. Paiement Mobile Money ou à la livraison.`;

  const canonical = `/categorie/${slug}`;

  return {
    title,
    description,
    keywords: [
      name,
      'Teka RDC',
      'acheter en ligne RDC',
      'livraison Lubumbashi',
      'livraison Kolwezi',
    ],
    openGraph: {
      title: `${name} | Teka RDC`,
      description,
      siteName: 'Teka RDC',
      type: 'website',
      locale: 'fr_CD',
      url: `https://teka.cd${canonical}`,
      images: [
        {
          url: 'https://teka.cd/og-default.png',
          width: 1200,
          height: 630,
          alt: `${name} | Teka RDC`,
        },
      ],
    },
    twitter: { card: 'summary', title: `${name} | Teka RDC`, description },
    alternates: { canonical },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const category = await serverFetch<ApiCategoryDetail>(
    `/v1/browse/categories/${slug}`,
  );
  if (!category) notFound();

  const name = category.name?.fr || '';

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Accueil',
              item: 'https://teka.cd',
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: 'Catégories',
              item: 'https://teka.cd/categories',
            },
            { '@type': 'ListItem', position: 3, name },
          ],
        }}
      />
      <CategoryPage categoryUuid={category.id} />
    </>
  );
}
