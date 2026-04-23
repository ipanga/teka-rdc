import type { Metadata } from 'next';
import CategoryPage from '@/components/pages/category-page';
import { JsonLd } from '@/components/seo/json-ld';
import { serverFetch } from '@/lib/server-api';

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const category = await serverFetch<{ name: Record<string, string>; productCount?: number }>(`/v1/browse/categories/${id}`);

  const name = category?.name?.[locale] || category?.name?.fr || '';
  const title = locale === 'fr'
    ? `${name} — Acheter en ligne sur Teka RDC`
    : `${name} — Buy Online on Teka RDC`;
  const description = locale === 'fr'
    ? `Découvrez les produits ${name} sur Teka RDC. Livraison rapide à Lubumbashi, Kolwezi et Likasi. Paiement Mobile Money ou à la livraison.`
    : `Browse ${name} products on Teka RDC. Fast delivery to Lubumbashi, Kolwezi, and Likasi. Pay via Mobile Money or cash on delivery.`;

  return {
    title,
    description,
    keywords: [name, 'Teka RDC', locale === 'fr' ? 'acheter en ligne RDC' : 'buy online DRC', locale === 'fr' ? 'livraison Lubumbashi' : 'delivery Lubumbashi'],
    openGraph: { title: `${name} | Teka RDC`, description, siteName: 'Teka RDC', type: 'website', locale: locale === 'fr' ? 'fr_CD' : 'en_CD', images: [{ url: 'https://teka.cd/og-default.png', width: 1200, height: 630, alt: `${name} | Teka RDC` }] },
    twitter: { card: 'summary', title: `${name} | Teka RDC`, description },
    alternates: {
      canonical: `/categories/${id}`,
      languages: { fr: `/fr/categories/${id}`, en: `/en/categories/${id}` },
    },
  };
}

export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  const category = await serverFetch<{ name: Record<string, string> }>(`/v1/browse/categories/${id}`);

  const name = category?.name?.[locale] || category?.name?.fr || '';

  return (
    <>
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: locale === 'fr' ? 'Accueil' : 'Home', item: 'https://teka.cd' },
          { '@type': 'ListItem', position: 2, name: locale === 'fr' ? 'Catégories' : 'Categories', item: `https://teka.cd/${locale}/categories` },
          { '@type': 'ListItem', position: 3, name: name },
        ],
      }} />
      <CategoryPage />
    </>
  );
}
