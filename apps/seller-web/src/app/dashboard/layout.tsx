'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api-client';
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

  // 'checking' until the seller's application status is known; 'approved'
  // unlocks the dashboard. Anything else redirects to the application flow.
  const [appGate, setAppGate] = useState<'checking' | 'approved'>('checking');

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

  // Approval gate. A freshly-registered seller has role SELLER but no
  // APPROVED SellerProfile — every dashboard page would 403. Send them to
  // the application flow until an admin approves.
  useEffect(() => {
    if (isLoading || !user || user.role !== 'SELLER') return;
    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch<{
          hasApplication: boolean;
          applicationStatus?: string;
        }>('/v1/sellers/application');
        if (cancelled) return;
        if (res.data.hasApplication && res.data.applicationStatus === 'APPROVED') {
          setAppGate('approved');
        } else {
          router.replace('/devenir-vendeur');
        }
      } catch {
        if (!cancelled) router.replace('/devenir-vendeur');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoading, user, router]);

  if (isLoading || !user || user.role !== 'SELLER' || appGate !== 'approved') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{"Chargement..."}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
