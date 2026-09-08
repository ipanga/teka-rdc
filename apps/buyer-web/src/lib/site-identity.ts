/**
 * Teka RDC's canonical site identity for structured data (SEO-1, 2026-09-08).
 * One definition, emitted on every page by the root layout.
 *
 * `logo` must resolve: the previous `/icons/icon-512.png` never existed
 * (404). `public/logo.svg` is the real wordmark served at the site root; SVG
 * is an accepted logo format for Google's Organization logo. Towns are NOT
 * named here — the served area is the country, and the active towns come
 * from the API (`/v1/cities`), never from static copy (inactive towns such
 * as Likasi must not be advertised — SEO-2 decision 7).
 */
export const SITE_URL = 'https://teka.cd';
export const SITE_NAME = 'Teka RDC';
export const SITE_LOGO_URL = `${SITE_URL}/logo.svg`;

export const ORGANIZATION_JSON_LD: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: SITE_LOGO_URL,
  description:
    'Marketplace en ligne en République Démocratique du Congo : produits vendus par des vendeurs approuvés, livraison locale et paiement à la livraison.',
  areaServed: { '@type': 'Country', name: 'Democratic Republic of the Congo' },
  sameAs: [
    'https://facebook.com/tekardc',
    'https://instagram.com/tekardc',
    'https://tiktok.com/@tekardc',
    'https://x.com/tekardc',
    'https://youtube.com/@tekardc',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    availableLanguage: ['French'],
    url: `${SITE_URL}/contact`,
  },
};

export const WEBSITE_JSON_LD: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: 'fr',
  publisher: { '@id': `${SITE_URL}/#organization` },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE_URL}/recherche?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
};
