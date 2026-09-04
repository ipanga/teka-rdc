'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api-client';
import { Icon, type IconName } from '@/components/ui/icons';
import { NotificationBell } from './notification-bell';

interface NavItem { href: string; label: string; icon: IconName; badge?: number }

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingSellers, setPendingSellers] = useState(0);
  const [pendingProducts, setPendingProducts] = useState(0);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ pendingSellerApplicationsCount?: number; pendingProductsCount?: number }>('/v1/admin/stats')
      .then((response) => {
        if (!cancelled) {
          setPendingSellers(response.data.pendingSellerApplicationsCount ?? 0);
          setPendingProducts(response.data.pendingProductsCount ?? 0);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);

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
        const focusable = drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
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

  const sections: { label: string; items: NavItem[] }[] = [
    { label: 'Pilotage', items: [
      { href: '/dashboard', label: 'Tableau de bord', icon: 'dashboard' },
      { href: '/dashboard/orders', label: 'Commandes', icon: 'orders' },
      { href: '/dashboard/returns', label: 'Retours', icon: 'logistics' },
    ] },
    { label: 'Communauté', items: [
      { href: '/dashboard/buyers', label: 'Acheteurs', icon: 'users' },
      { href: '/dashboard/sellers', label: 'Vendeurs', icon: 'sellers', badge: pendingSellers },
      { href: '/dashboard/admins', label: 'Administrateurs', icon: 'shield' },
    ] },
    { label: 'Catalogue', items: [
      { href: '/dashboard/products', label: 'Produits', icon: 'products', badge: pendingProducts },
      { href: '/dashboard/categories', label: 'Catégories', icon: 'catalog' },
      { href: '/dashboard/brands', label: 'Marques', icon: 'products' },
      { href: '/dashboard/catalog-coverage', label: 'Couverture catalogue', icon: 'reports' },
      { href: '/dashboard/reviews', label: 'Avis', icon: 'quality' },
    ] },
    { label: 'Logistique', items: [
      { href: '/dashboard/cities', label: 'Villes', icon: 'logistics' },
      { href: '/dashboard/delivery-zones', label: 'Zones de livraison', icon: 'logistics' },
    ] },
    { label: 'Finance', items: [
      { href: '/dashboard/transactions', label: 'Transactions', icon: 'finance' },
      { href: '/dashboard/payouts', label: 'Virements', icon: 'finance' },
      { href: '/dashboard/commission', label: 'Commissions', icon: 'finance' },
      { href: '/dashboard/reports', label: 'Rapports', icon: 'reports' },
    ] },
    { label: 'Communication', items: [
      { href: '/dashboard/promotions', label: 'Promotions', icon: 'quality' },
      { href: '/dashboard/banners', label: 'Bannières', icon: 'content' },
      { href: '/dashboard/content', label: 'Contenu', icon: 'content' },
      { href: '/dashboard/broadcasts', label: 'Notifications', icon: 'bell' },
    ] },
    { label: 'Système', items: [
      { href: '/dashboard/settings', label: 'Paramètres', icon: 'settings' },
    ] },
  ];

  const isActive = (href: string) => href === '/dashboard' ? pathname === href : pathname.startsWith(href);
  const nav = (
    <nav aria-label="Navigation administrateur" className="flex-1 space-y-5 overflow-y-auto p-4">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">{section.label}</p>
          <div className="space-y-1">
            {section.items.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} aria-current={isActive(item.href) ? 'page' : undefined}
                className={`group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive(item.href) ? 'bg-primary font-semibold text-white shadow-sm shadow-black/10' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
                <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {!!item.badge && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-xs font-bold text-primary" aria-label={`${item.badge} en attente`}>{item.badge > 99 ? '99+' : item.badge}</span>}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  const handleLogout = async () => { await logout(); router.push('/login'); };
  const userBlock = (
    <div className="border-t border-white/10 p-4">
      <Link href="/dashboard/profile" onClick={() => setMobileOpen(false)} className="mb-3 flex items-center gap-3 rounded-lg p-1 hover:bg-white/5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-white ring-1 ring-white/15">{user?.firstName?.[0] || '?'}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{user?.firstName} {user?.lastName}</p><p className="truncate text-xs text-white/55">Administration</p></div>
      </Link>
      <button type="button" onClick={handleLogout} className="min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-white/70 hover:bg-white/10 hover:text-white">Se déconnecter</button>
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-foreground text-white lg:hidden">
        <div className="flex h-16 items-center justify-between gap-3 px-4">
          <button ref={menuButtonRef} type="button" onClick={() => setMobileOpen(true)} className="grid h-11 w-11 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white" aria-label="Ouvrir le menu administrateur"><Icon name="menu" className="h-5 w-5" /></button>
          <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.svg" alt="Teka RDC" className="h-7 w-auto" width={140} height={28} />
          </Link>
          <NotificationBell />
        </div>
      </header>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Fermer le menu administrateur" className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside ref={drawerRef} role="dialog" aria-modal="true" aria-label="Menu administrateur" className="relative flex h-full w-[min(88vw,340px)] flex-col bg-foreground text-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-white.svg" alt="Teka RDC" className="h-7 w-auto" width={140} height={28} />
              <button ref={closeButtonRef} type="button" onClick={() => { setMobileOpen(false); menuButtonRef.current?.focus(); }} className="grid h-10 w-10 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white" aria-label="Fermer"><Icon name="close" className="h-5 w-5" /></button>
            </div>
            {nav}{userBlock}
          </aside>
        </div>
      )}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col bg-foreground text-white lg:flex xl:w-80">
        <div className="border-b border-white/10 p-6">
          <div className="flex items-start justify-between gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.svg" alt="Teka RDC" className="h-7 w-auto" width={140} height={28} />
            <NotificationBell />
          </div>
          <p className="mt-2 text-sm text-white/55">Administration</p>
        </div>
        {nav}{userBlock}
      </aside>
    </>
  );
}
