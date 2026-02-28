'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useRouter } from '@/i18n/navigation';
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

  const [unreadCount, setUnreadCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await apiFetch<{ count: number }>('/v1/messages/unread-count');
        setUnreadCount(res.data?.count ?? (typeof res.data === 'number' ? (res.data as unknown as number) : 0));
      } catch {
        // Silently ignore
      }
    };

    fetchUnread();
    pollRef.current = setInterval(fetchUnread, 30000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  const navItems: NavItem[] = [
    { href: '/dashboard', label: t('dashboard'), icon: '\u2302' },
    { href: '/dashboard/products', label: t('myProducts'), icon: '\u2630' },
    { href: '/dashboard/orders', label: t('orders'), icon: '\uD83D\uDCE6' },
    { href: '/dashboard/earnings', label: t('earnings'), icon: '\uD83D\uDCB0' },
    { href: '/dashboard/reviews', label: t('reviews'), icon: '\u2605' },
    { href: '/dashboard/promotions', label: t('promotions'), icon: '\uD83C\uDFF7' },
    { href: '/dashboard/messages', label: t('messages'), icon: '\u2709', badge: unreadCount },
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
    <aside className="w-64 min-h-screen bg-foreground text-white flex flex-col shrink-0">
      <div className="p-6 border-b border-white/10">
        <h2 className="text-lg font-bold">Teka RDC</h2>
        <p className="text-sm text-white/60 mt-1">{t('sellerPortal')}</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
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
            {item.badge !== undefined && item.badge > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-xs font-bold">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </Link>
        ))}
      </nav>

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
          {t('logout')}
        </button>
      </div>
    </aside>
  );
}
