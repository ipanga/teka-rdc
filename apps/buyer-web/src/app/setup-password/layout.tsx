import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Définir mon mot de passe',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
