'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
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

  // Count badges on the Vendeurs + Produits nav items, so admins see new
  // seller applications / products awaiting review without opening the page.
  const [pendingSellers, setPendingSellers] = useState(0);
  const [pendingProducts, setPendingProducts] = useState(0);
  useEffect(() => {
    let cancelled = false;
    apiFetch<{
      pendingSellerApplicationsCount?: number;
      pendingProductsCount?: number;
    }>('/v1/admin/stats')
      .then((res) => {
        if (!cancelled) {
          setPendingSellers(res.data.pendingSellerApplicationsCount ?? 0);
          setPendingProducts(res.data.pendingProductsCount ?? 0);
        }
      })
      .catch(() => {
        // Non-critical: a failed stats fetch just hides the badge.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const navItems: NavItem[] = [
    { href: '/dashboard', label: "Tableau de bord", icon: '\u2302' },
    { href: '/dashboard/buyers', label: "Acheteurs", icon: '\u2637' },
    {
      href: '/dashboard/sellers',
      label: "Vendeurs",
      icon: '\u2606',
      badge: pendingSellers,
    },
    { href: '/dashboard/admins', label: "Administrateurs", icon: '\u272a' },
    { href: '/dashboard/categories', label: "Cat\u00E9gories", icon: '\u2630' },
    { href: '/dashboard/brands', label: "Marques", icon: '\uD83C\uDFF7' },
    {
      href: '/dashboard/products',
      label: "Produits",
      icon: '\u2610',
      badge: pendingProducts,
    },
    { href: '/dashboard/catalog-coverage', label: "Couverture catalogue", icon: '\u25f7' },
    { href: '/dashboard/orders', label: "Commandes", icon: '\uD83D\uDCE6' },
    { href: '/dashboard/cities', label: "Villes", icon: '\uD83C\uDFD9' },
    { href: '/dashboard/delivery-zones', label: "Zones de livraison", icon: '\uD83D\uDE9A' },
    { href: '/dashboard/transactions', label: "Transactions", icon: '\uD83D\uDCC4' },
    { href: '/dashboard/payouts', label: "Virements", icon: '\uD83D\uDCB5' },
    { href: '/dashboard/returns', label: "Retours", icon: '\u21A9' },
    { href: '/dashboard/commission', label: "Commissions", icon: '\u2699' },
    { href: '/dashboard/reviews', label: "Avis", icon: '\u2605' },
    { href: '/dashboard/banners', label: "Banni\u00E8res", icon: '\uD83D\uDDBC' },
    { href: '/dashboard/promotions', label: "Promotions", icon: '\uD83C\uDFF7' },
    { href: '/dashboard/content', label: "Contenu", icon: '\uD83D\uDCDD' },
    { href: '/dashboard/broadcasts', label: "Centre de notifications", icon: '\uD83D\uDCE2' },
    { href: '/dashboard/reports', label: "Rapports", icon: '\uD83D\uDCCA' },
    { href: '/dashboard/settings', label: "Param\u00E8tres", icon: '\u2699\uFE0F' },
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
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setMobileOpen(false)}
          className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            isActive(item.href)
              ? 'bg-primary text-white font-semibold shadow-sm shadow-black/10'
              : 'text-white/75 hover:bg-white/10 hover:text-white'
          }`}
        >
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-sm ${
              isActive(item.href) ? 'bg-white/15' : 'bg-white/10 group-hover:bg-white/15'
            }`}
            aria-hidden="true"
          >
            {item.icon}
          </span>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge ? (
            <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-xs font-bold text-primary">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );

  const userBlock = (
    <div className="p-4 border-t border-white/10">
      <Link
        href="/dashboard/profile"
        onClick={() => setMobileOpen(false)}
        className="flex items-center gap-3 mb-3 -mx-1 px-1 py-1 rounded-lg hover:bg-white/5 transition-colors"
      >
        {user?.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar}
            alt=""
            className="w-9 h-9 rounded-full object-cover bg-white/10 ring-1 ring-white/15"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-sm font-semibold text-white ring-1 ring-white/15">
            {user?.firstName?.[0] || '?'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="text-xs text-white/60 truncate">{user?.role}</p>
        </div>
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        className="w-full text-left px-3 py-2 text-sm text-white/75 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
      >
        Se déconnecter
      </button>
    </div>
  );

  return (
    <>
      <header className="lg:hidden sticky top-0 z-40 bg-foreground text-white border-b border-white/10">
        <div className="h-16 px-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Ouvrir le menu administrateur"
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
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Fermer le menu administrateur"
            className="absolute inset-0 bg-black/45"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[min(86vw,340px)] bg-foreground text-white flex flex-col shadow-2xl">
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

      <aside className="hidden lg:flex sticky top-0 h-screen w-72 bg-foreground text-white flex-col shrink-0">
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
          <p className="text-sm text-white/60 mt-2">Panneau d&apos;administration</p>
        </div>

        {nav}
        {userBlock}
      </aside>
    </>
  );
}
