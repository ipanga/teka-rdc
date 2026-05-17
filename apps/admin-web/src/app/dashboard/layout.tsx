'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { useAuthStore } from '@/lib/auth-store';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  // Role gate. COOKIE_DOMAIN=.teka.cd lets buyer/seller cookies reach
  // this subdomain, so middleware can't tell a real admin from another
  // authenticated user who navigated to admin.teka.cd. Once /me returns
  // we double-check role here: anything other than ADMIN gets logged
  // out and bounced back to /login so they don't sit on a broken admin
  // dashboard full of 403s.
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'ADMIN') {
      logout().finally(() => router.replace('/login'));
    }
  }, [isLoading, user, logout, router]);

  if (isLoading || !user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-background">
        {children}
      </main>
    </div>
  );
}
