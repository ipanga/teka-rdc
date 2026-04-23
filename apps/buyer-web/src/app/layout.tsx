import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#BF0000',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://teka.cd'),
  title: {
    default: 'Teka RDC — Supermarché en ligne en RD Congo',
    template: '%s | Teka RDC',
  },
  description: 'Teka RDC, votre supermarché en ligne en République Démocratique du Congo. Achetez smartphones, vêtements, électronique et plus. Livraison à Lubumbashi, Kolwezi et Likasi.',
  keywords: ['supermarché en ligne RDC', 'acheter en ligne RDC', 'livraison Lubumbashi', 'livraison Kolwezi', 'marketplace Congo', 'Teka RDC', 'teka.cd', 'e-commerce RDC', 'boutique en ligne Congo', 'acheter smartphone Lubumbashi'],
  authors: [{ name: 'Teka RDC', url: 'https://teka.cd' }],
  creator: 'Teka RDC',
  publisher: 'Teka RDC',
  formatDetection: { telephone: true, email: false },
  category: 'ecommerce',
  openGraph: {
    type: 'website',
    siteName: 'Teka RDC',
    locale: 'fr_CD',
    alternateLocale: 'en_CD',
    images: [{ url: 'https://teka.cd/og-default.png', width: 1200, height: 630, alt: 'Teka RDC — Supermarché en ligne' }],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@tekardc',
    site: '@tekardc',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    // Add real values when available
    // google: 'your-google-verification-code',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Teka RDC',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
