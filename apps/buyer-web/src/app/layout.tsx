import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import { Clarity } from '@/components/analytics/clarity';
import { AuthProvider } from '@/components/providers/auth-provider';
import { PostHogPageview } from '@/components/providers/posthog-pageview';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import { CitySelectorModal } from '@/components/city/city-selector-modal';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();

  return (
    <html lang="fr" className={inter.variable}>
      <body className="font-sans antialiased">
        <PostHogProvider>
          <NextIntlClientProvider messages={messages}>
            <AuthProvider>
              {children}
              {/* Town selector — mounted globally so the header "Livrer à …"
                  button opens it on EVERY page (not just the homepage). Renders
                  null until opened → no SSR/SEO footprint. */}
              <CitySelectorModal />
              <Suspense fallback={null}>
                <PostHogPageview />
              </Suspense>
            </AuthProvider>
          </NextIntlClientProvider>
        </PostHogProvider>
        <Clarity />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
