'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { Icon, type IconName } from '@/components/ui/icons';
import { NotificationBell } from './notification-bell';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Activité',
    items: [
      { href: '/dashboard', label: 'Tableau de bord', icon: 'dashboard' },
      { href: '/dashboard/orders', label: 'Commandes', icon: 'orders' },
      { href: '/dashboard/products', label: 'Produits', icon: 'products' },
    ],
  },
  {
    label: 'Développement',
    items: [
      { href: '/dashboard/earnings', label: 'Revenus', icon: 'earnings' },
      { href: '/dashboard/reviews', label: 'Avis clients', icon: 'reviews' },
      { href: '/dashboard/promotions', label: 'Promotions', icon: 'promotions' },
    ],
  },
  {
    label: 'Compte',
    items: [{ href: '/dashboard/profile', label: 'Profil et réglages', icon: 'profile' }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
        return;
      }

      if (event.key === 'Tab') {
        const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  const nav = (
    <nav aria-label="Navigation vendeur" className="flex-1 space-y-5 overflow-y-auto p-4">
      {navSections.map((section) => (
        <div key={section.label}>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
            {section.label}
          </p>
          <div className="space-y-1">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={`group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive(item.href)
                    ? 'bg-primary font-semibold text-white shadow-sm shadow-black/10'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  const userBlock = (
    <div className="border-t border-white/10 p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-white ring-1 ring-white/15">
          {user?.firstName?.[0] || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="truncate text-xs text-white/55">{user?.phone}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        Se déconnecter
      </button>
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-foreground text-white md:hidden">
        <div className="flex h-16 items-center justify-between gap-3 px-4">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Ouvrir le menu vendeur"
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.svg" alt="Teka RDC" className="h-7 w-auto" width={140} height={28} />
          </Link>
          <NotificationBell />
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fermer le menu vendeur"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu vendeur"
            className="relative flex h-full w-[min(86vw,320px)] flex-col bg-foreground text-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-white.svg" alt="Teka RDC" className="h-7 w-auto" width={140} height={28} />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  menuButtonRef.current?.focus();
                }}
                className="grid h-10 w-10 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Fermer"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {userBlock}
          </aside>
        </div>
      )}

      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-foreground text-white md:flex xl:w-72">
        <div className="border-b border-white/10 p-6">
          <div className="flex items-start justify-between gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.svg" alt="Teka RDC" className="h-7 w-auto" width={140} height={28} />
            <NotificationBell />
          </div>
          <p className="mt-2 text-sm text-white/55">Espace vendeur</p>
        </div>
        {nav}
        {userBlock}
      </aside>
    </>
  );
}
