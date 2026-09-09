import type { Metadata } from 'next';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { AuthProvider } from '@/components/providers/auth-provider';
import { PostHogPageview } from '@/components/providers/posthog-pageview';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Teka RDC Admin',
    template: '%s | Teka RDC Admin',
  },
  description: 'Panneau interne Teka RDC',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
    },
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // D4: the CSP nonce (set by middleware) only works when the page renders
  // per request; reading the request headers here makes every route dynamic.
  await headers();
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
      </body>
    </html>
  );
}
