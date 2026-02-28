'use client';

import { useAuthStore } from '@/lib/auth-store';
import { useTranslations } from 'next-intl';
import { Sidebar } from '@/components/layout/sidebar';
import { LanguageSwitcher } from '@/components/layout/language-switcher';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isLoading = useAuthStore((s) => s.isLoading);
  const t = useTranslations('Dashboard');

  if (isLoading) {
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
        <header className="h-14 border-b border-border bg-white flex items-center justify-between px-6 shrink-0">
          <div />
          <LanguageSwitcher />
        </header>
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
