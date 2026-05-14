import type { Metadata } from 'next';
import HomePage from '@/components/pages/home-page';
import { JsonLd } from '@/components/seo/json-ld';

export async function generateMetadata(): Promise<Metadata> {
  const title = 'Teka RDC — Supermarché en ligne en RD Congo | Livraison Lubumbashi & Kolwezi';
  const description = 'Teka RDC, votre supermarché en ligne en RD Congo. Achetez smartphones, vêtements, électronique et plus. Livraison rapide à Lubumbashi, Kolwezi et Likasi. Paiement Mobile Money ou à la livraison.';

  return {
    title,
    description,
    keywords: ['supermarché en ligne RDC', 'acheter en ligne RDC', 'livraison Lubumbashi', 'livraison Kolwezi', 'marketplace Congo', 'Teka RDC', 'boutique en ligne RDC', 'acheter smartphone Lubumbashi', 'Mobile Money RDC', 'paiement à la livraison Congo'],
    openGraph: {
      title,
      description,
      url: 'https://teka.cd',
      siteName: 'Teka RDC',
      locale: 'fr_CD',
      type: 'website',
      images: [{ url: 'https://teka.cd/og-default.png', width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: '/' },
  };
}

export default async function Page() {

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
          availableLanguage: ['French'],
        },
      }} />
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Teka RDC',
        url: 'https://teka.cd',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://teka.cd/recherche?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      }} />
      <HomePage serverH1="Teka RDC — Supermarché en ligne en RD Congo" />
    </>
  );
}
