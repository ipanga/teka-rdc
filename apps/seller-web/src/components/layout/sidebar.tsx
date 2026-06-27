'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { NotificationBell } from './notification-bell';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Direct buyer\u2194seller messaging was removed on 2026-05-17 \u2014 the
  // Messages nav item + unread-count polling were removed with it.
  // Buyer questions now reach Teka RDC support instead of the seller.

  const navItems: NavItem[] = [
    { href: '/dashboard', label: 'Tableau de bord', icon: '\u2302' },
    { href: '/dashboard/products', label: 'Mes Produits', icon: '\u2630' },
    { href: '/dashboard/orders', label: 'Commandes', icon: '\uD83D\uDCE6' },
    { href: '/dashboard/earnings', label: 'Revenus', icon: '\uD83D\uDCB0' },
    { href: '/dashboard/reviews', label: 'Avis', icon: '\u2605' },
    { href: '/dashboard/promotions', label: 'Promotions', icon: '\uD83C\uDFF7' },
    { href: '/dashboard/profile', label: 'Mon profil', icon: '\uD83D\uDC64' },
  ];

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  const nav = (
    <nav className="flex-1 p-4 space-y-1">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            isActive(item.href)
              ? 'bg-primary text-white font-medium'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          }`}
        >
          <span className="text-lg">{item.icon}</span>
          <span className="flex-1">{item.label}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-xs font-bold">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );

  const userBlock = (
    <div className="p-4 border-t border-white/10">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-medium text-white">
          {user?.firstName?.[0] || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="text-xs text-white/60 truncate">{user?.phone}</p>
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="w-full text-left px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
      >
        Se déconnecter
      </button>
    </div>
  );

  return (
    <>
      <header className="md:hidden sticky top-0 z-40 bg-foreground text-white border-b border-white/10">
        <div className="h-16 px-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Ouvrir le menu vendeur"
          >
            ☰
          </button>
          <Link href="/dashboard" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.svg" alt="Teka RDC" className="h-7 w-auto" width={140} height={28} />
          </Link>
          <NotificationBell />
        </div>
      </header>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Fermer le menu vendeur"
            className="absolute inset-0 bg-black/45"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[min(82vw,320px)] bg-foreground text-white flex flex-col shadow-2xl">
            <div className="p-5 border-b border-white/10 flex items-center justify-between gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-white.svg" alt="Teka RDC" className="h-7 w-auto" width={140} height={28} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="h-9 w-9 rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            {nav}
            {userBlock}
          </aside>
        </div>
      )}

      <aside className="hidden md:flex w-64 min-h-screen bg-foreground text-white flex-col shrink-0">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-start justify-between gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-white.svg"
            alt="Teka RDC"
            className="h-7 w-auto"
            width={140}
            height={28}
          />
          <NotificationBell />
        </div>
        <p className="text-sm text-white/60 mt-2">Espace Vendeur</p>
      </div>

      {nav}
      {userBlock}
    </aside>
    </>
  );
}
