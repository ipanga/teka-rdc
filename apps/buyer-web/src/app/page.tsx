import type { Metadata } from 'next';
import HomePage from '@/components/pages/home-page';

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
  // Hour-precision timestamp — hints FB/LinkedIn/etc. that they should refresh
  // their per-URL scrape cache. React 19 hoists this <meta> into <head>.
  const ogUpdated = new Date(
    Math.floor(Date.now() / 3_600_000) * 3_600_000,
  ).toISOString();

  return (
    <>
      <meta property="og:updated_time" content={ogUpdated} />
      {/* Organization + WebSite JSON-LD moved to the root layout (SEO-1) —
          one site-wide identity, no per-page copy to drift. */}
      <HomePage serverH1="Teka RDC — Supermarché en ligne en RD Congo" />
    </>
  );
}
