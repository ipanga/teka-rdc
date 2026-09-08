import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import { Clarity } from '@/components/analytics/clarity';
import { AuthProvider } from '@/components/providers/auth-provider';
import { PostHogPageview } from '@/components/providers/posthog-pageview';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import { CitySelectorModal } from '@/components/city/city-selector-modal';
import { WishlistSync } from '@/components/wishlist/wishlist-sync';
import { JsonLd } from '@/components/seo/json-ld';
import { ORGANIZATION_JSON_LD, WEBSITE_JSON_LD } from '@/lib/site-identity';
import './globals.css';
import { getActiveCities } from '@/lib/server-cities';
import { deliveryPhrase } from '@/lib/service-area';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#BF0000',
};

/**
 * Root metadata. Async so the description names the towns that are
 * actually served (SEO-2 decision 2) — from the active-town API, cached 60 s
 * like every server fetch, never a hard-coded list.
 */
export async function generateMetadata(): Promise<Metadata> {
  const towns = await getActiveCities();
  return {
  metadataBase: new URL('https://teka.cd'),
  title: {
    default: 'Teka RDC — Supermarché en ligne en RD Congo',
    template: '%s | Teka RDC',
  },
  description: `Teka RDC, votre supermarché en ligne en République Démocratique du Congo. Achetez smartphones, vêtements, électronique et plus. ${deliveryPhrase(towns)}`,
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
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Teka RDC',
  },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="font-sans antialiased">
        {/* Site identity on EVERY page (SEO-1): Organization (with a logo
            that resolves) + WebSite (sitelinks search). Emitted once here so
            no page can duplicate or contradict it — the homepage no longer
            carries its own copy. Data blocks are not executed by the browser,
            so they need no CSP nonce; every block goes through JsonLd's
            escaping (D4/S2), never a raw JSON.stringify. */}
        <JsonLd data={ORGANIZATION_JSON_LD} />
        <JsonLd data={WEBSITE_JSON_LD} />
        <PostHogProvider>
          <AuthProvider>
            {children}
            {/* Town selector — mounted globally so the header "Livrer à …"
                button opens it on EVERY page (not just the homepage). Renders
                null until opened → no SSR/SEO footprint. */}
            <CitySelectorModal />
            {/* Headless wishlist ↔ auth sync — keeps product-card heart state
                working app-wide now that the header no longer renders the
                wishlist badge. Renders null → no SSR/SEO footprint. */}
            <WishlistSync />
            <Suspense fallback={null}>
              <PostHogPageview />
            </Suspense>
          </AuthProvider>
        </PostHogProvider>
        <Clarity />
        <script
          dangerouslySetInnerHTML={{
            __html:
              process.env.NODE_ENV === 'production'
                ? `
                  if ('serviceWorker' in navigator) {
                    window.addEventListener('load', () => {
                      navigator.serviceWorker.register('/sw.js').catch(() => {});
                    });
                  }
                `
                : `
                  if ('serviceWorker' in navigator) {
                    window.addEventListener('load', () => {
                      navigator.serviceWorker.getRegistrations()
                        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
                        .catch(() => {});
                    });
                  }
                `,
          }}
        />
      </body>
    </html>
  );
}
