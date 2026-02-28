import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Teka RDC',
  description: 'Votre marketplace en ligne en RD Congo',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
