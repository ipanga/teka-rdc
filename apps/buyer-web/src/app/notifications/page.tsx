import type { Metadata } from 'next';
import NotificationsPage from '@/components/pages/notifications-page';

// Private, per-user page — keep it out of the index (no SEO value, user-scoped).
export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <NotificationsPage />;
}
