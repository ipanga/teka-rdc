import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Clarity } from '@/components/analytics/clarity';
import { AuthProvider } from '@/components/providers/auth-provider';
import { PostHogPageview } from '@/components/providers/posthog-pageview';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Teka RDC Seller',
    template: '%s | Teka RDC Seller',
  },
  description: 'Espace vendeur privé Teka RDC',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">
        <PostHogProvider>
          <AuthProvider>
            {children}
            <Suspense fallback={null}>
              <PostHogPageview />
            </Suspense>
          </AuthProvider>
        </PostHogProvider>
        <Clarity />
      </body>
    </html>
  );
}
