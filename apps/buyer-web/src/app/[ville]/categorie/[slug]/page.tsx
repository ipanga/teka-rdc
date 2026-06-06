import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CategoryPage from '@/components/pages/category-page';
import { JsonLd } from '@/components/seo/json-ld';
import { serverFetch } from '@/lib/server-api';
import { findCityBySlug } from '@/lib/server-cities';

type Props = { params: Promise<{ ville: string; slug: string }> };

interface ApiCategoryDetail {
  id: string;
  slug: string | null;
  name: string;
  productCount?: number;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ville, slug } = await params;
  const [city, category] = await Promise.all([
    findCityBySlug(ville),
    serverFetch<ApiCategoryDetail>(`/v1/browse/categories/${slug}`),
  ]);

  const name = category?.name || '';
  const cityName = city?.name || '';
  const title = `${name} à ${cityName} — Acheter en ligne sur Teka RDC`;
  const description = `Découvrez les produits ${name} disponibles à ${cityName} sur Teka RDC. Livraison rapide et paiement à la livraison.`;
  const canonical = `/${ville}/categorie/${slug}`;

  return {
    title,
    description,
    keywords: [name, `${name} ${cityName}`, 'Teka RDC', `livraison ${cityName}`],
    openGraph: {
      title: `${name} à ${cityName} | Teka RDC`,
      description,
      siteName: 'Teka RDC',
      type: 'website',
      locale: 'fr_CD',
      url: `https://teka.cd${canonical}`,
      images: [{ url: 'https://teka.cd/og-default.png', width: 1200, height: 630, alt: `${name} | Teka RDC` }],
    },
    twitter: { card: 'summary', title: `${name} à ${cityName} | Teka RDC`, description },
    alternates: { canonical },
  };
}

export default async function Page({ params }: Props) {
  const { ville, slug } = await params;
  const [city, category] = await Promise.all([
    findCityBySlug(ville),
    serverFetch<ApiCategoryDetail>(`/v1/browse/categories/${slug}`),
  ]);
  if (!city || !category) notFound();

  const name = category.name || '';
  const ogUpdated = new Date(
    Math.floor(Date.now() / 3_600_000) * 3_600_000,
  ).toISOString();

  return (
    <>
      <meta property="og:updated_time" content={ogUpdated} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://teka.cd' },
            { '@type': 'ListItem', position: 2, name: city.name, item: `https://teka.cd/${ville}` },
            { '@type': 'ListItem', position: 3, name },
          ],
        }}
      />
      <CategoryPage categoryUuid={category.id} cityId={city.id} />
    </>
  );
}
