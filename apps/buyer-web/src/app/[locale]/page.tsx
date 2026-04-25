import type { Metadata } from 'next';
import HomePage from '@/components/pages/home-page';
import { JsonLd } from '@/components/seo/json-ld';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'fr'
    ? 'Teka RDC — Supermarché en ligne en RD Congo | Livraison Lubumbashi & Kolwezi'
    : 'Teka RDC — Online Supermarket in DR Congo | Delivery Lubumbashi & Kolwezi';
  const description = locale === 'fr'
    ? 'Teka RDC, votre supermarché en ligne en RD Congo. Achetez smartphones, vêtements, électronique et plus. Livraison rapide à Lubumbashi, Kolwezi et Likasi. Paiement Mobile Money ou à la livraison.'
    : 'Teka RDC, your online supermarket in DR Congo. Buy smartphones, clothing, electronics and more. Fast delivery to Lubumbashi, Kolwezi, and Likasi. Pay via Mobile Money or cash on delivery.';

  return {
    title,
    description,
    keywords: locale === 'fr'
      ? ['supermarché en ligne RDC', 'acheter en ligne RDC', 'livraison Lubumbashi', 'livraison Kolwezi', 'marketplace Congo', 'Teka RDC', 'boutique en ligne RDC', 'acheter smartphone Lubumbashi', 'Mobile Money RDC', 'paiement à la livraison Congo']
      : ['online supermarket DRC', 'buy online Congo', 'delivery Lubumbashi', 'delivery Kolwezi', 'marketplace Congo', 'Teka RDC', 'online shopping DRC', 'buy smartphone Lubumbashi', 'Mobile Money DRC', 'cash on delivery Congo'],
    openGraph: {
      title,
      description,
      url: 'https://teka.cd',
      siteName: 'Teka RDC',
      locale: locale === 'fr' ? 'fr_CD' : 'en_CD',
      type: 'website',
      images: [{ url: 'https://teka.cd/og-default.png', width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: '/' },
  };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;

  return (
    <>
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Teka RDC',
        url: 'https://teka.cd',
        logo: 'https://teka.cd/icons/icon-512.png',
        description: 'Supermarché en ligne en République Démocratique du Congo. Livraison à Lubumbashi, Kolwezi et Likasi.',
        areaServed: {
          '@type': 'Country',
          name: 'Democratic Republic of the Congo',
        },
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer service',
          availableLanguage: ['French', 'English'],
        },
      }} />
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Teka RDC',
        url: 'https://teka.cd',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://teka.cd/search?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      }} />
      <HomePage serverH1={locale === 'fr'
        ? 'Teka RDC — Supermarché en ligne en RD Congo'
        : 'Teka RDC — Online Supermarket in DR Congo'
      } />
    </>
  );
}
