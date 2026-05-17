'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useTranslations } from 'next-intl';
import { Sidebar } from '@/components/layout/sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const t = useTranslations('Dashboard');

  // Role gate. COOKIE_DOMAIN=.teka.cd lets buyer cookies reach this
  // subdomain, so middleware can't tell a real seller from a logged-in
  // buyer who navigated to seller.teka.cd. Once /me returns we
  // double-check role here: anything other than SELLER means the
  // session belongs to a different role on a different surface — we
  // log out so they fall back to the seller login form cleanly instead
  // of seeing a broken dashboard full of 403s.
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'SELLER') {
      logout().finally(() => router.replace('/login'));
    }
  }, [isLoading, user, logout, router]);

  if (isLoading || !user || user.role !== 'SELLER') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t('loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
