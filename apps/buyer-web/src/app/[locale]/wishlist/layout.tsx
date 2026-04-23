import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Liste de souhaits',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
