import type { Metadata } from 'next';

// Printable documents live OUTSIDE /dashboard on purpose: no sidebar, header
// or admin chrome can end up on paper. Still protected by the middleware
// (session gate, noindex, private no-store) and by the page's ADMIN role gate;
// the data itself comes from the ADMIN-only API.
export const metadata: Metadata = {
  title: 'Bon de livraison',
};

export default function DocumentsLayout({ children }: { children: React.ReactNode }) {
  return <div className="bdl-page">{children}</div>;
}
