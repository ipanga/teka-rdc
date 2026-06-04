import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Suspense } from 'react';
import { AuthProvider } from '@/components/providers/auth-provider';
import { PostHogPageview } from '@/components/providers/posthog-pageview';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Teka RDC',
  description: 'Votre marketplace en ligne en RD Congo',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();

  return (
    <html lang="fr">
      <body className="font-sans antialiased">
        <PostHogProvider>
          <NextIntlClientProvider messages={messages}>
            <AuthProvider>
              {children}
              <Suspense fallback={null}>
                <PostHogPageview />
              </Suspense>
            </AuthProvider>
          </NextIntlClientProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
