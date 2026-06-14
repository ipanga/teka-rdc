'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

export function Sidebar() {
  const t = useTranslations('Sidebar');
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();

  // Pending seller applications → a count badge on the Vendeurs nav item, so
  // admins see new applications awaiting review without opening the page.
  const [pendingSellers, setPendingSellers] = useState(0);
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ pendingSellerApplicationsCount?: number }>('/v1/admin/stats')
      .then((res) => {
        if (!cancelled) {
          setPendingSellers(res.data.pendingSellerApplicationsCount ?? 0);
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
    { href: '/dashboard', label: t('dashboard'), icon: '\u2302' },
    { href: '/dashboard/buyers', label: t('buyers'), icon: '\u2637' },
    {
      href: '/dashboard/sellers',
      label: t('sellers'),
      icon: '\u2606',
      badge: pendingSellers,
    },
    { href: '/dashboard/admins', label: t('admins'), icon: '\u272a' },
    { href: '/dashboard/categories', label: t('categories'), icon: '\u2630' },
    { href: '/dashboard/brands', label: t('brands'), icon: '\ud83c\udff7' },
    { href: '/dashboard/products', label: t('products'), icon: '\u2610' },
    { href: '/dashboard/catalog-coverage', label: t('catalogCoverage'), icon: '\u25f7' },
    { href: '/dashboard/orders', label: t('orders'), icon: '\uD83D\uDCE6' },
    { href: '/dashboard/cities', label: t('cities'), icon: '\uD83C\uDFD9' },
    { href: '/dashboard/delivery-zones', label: t('deliveryZones'), icon: '\uD83D\uDE9A' },
    { href: '/dashboard/transactions', label: t('transactions'), icon: '\uD83D\uDCC4' },
    { href: '/dashboard/payouts', label: t('payouts'), icon: '\uD83D\uDCB5' },
    { href: '/dashboard/commission', label: t('commission'), icon: '\u2699' },
    { href: '/dashboard/reviews', label: t('reviews'), icon: '\u2605' },
    { href: '/dashboard/banners', label: t('banners'), icon: '\uD83D\uDDBC' },
    { href: '/dashboard/promotions', label: t('promotions'), icon: '\uD83C\uDFF7' },
    { href: '/dashboard/content', label: t('content'), icon: '\uD83D\uDCDD' },
    { href: '/dashboard/broadcasts', label: t('broadcasts'), icon: '\uD83D\uDCE2' },
    { href: '/dashboard/reports', label: t('reports'), icon: '\uD83D\uDCCA' },
    { href: '/dashboard/settings', label: t('settings'), icon: '\u2699\uFE0F' },
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

  return (
    <aside className="w-64 min-h-screen bg-foreground text-white flex flex-col">
      <div className="p-6 border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-white.svg"
          alt="Teka RDC"
          className="h-7 w-auto"
          width={140}
          height={28}
        />
        <p className="text-sm text-white/60 mt-2">{t('adminPanel')}</p>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isActive(item.href)
                ? 'bg-primary text-white font-medium'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.badge ? (
              <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-white text-xs font-semibold">
                {item.badge}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <Link
          href="/dashboard/profile"
          className="flex items-center gap-3 mb-3 -mx-1 px-1 py-1 rounded-lg hover:bg-white/5 transition-colors"
        >
          {user?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar}
              alt="avatar"
              className="w-8 h-8 rounded-full object-cover bg-white/10"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-medium text-white">
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
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          {t('logout')}
        </button>
      </div>
    </aside>
  );
}
