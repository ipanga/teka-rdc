import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://teka.cd'),
  title: {
    default: 'Teka RDC',
    template: '%s | Teka RDC',
  },
  description: 'Votre marketplace en ligne en RD Congo',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
