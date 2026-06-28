'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useCityStore } from '@/lib/city-store';
import { useWishlistStore } from '@/lib/wishlist-store';
import { CartBadge } from '@/components/cart/cart-badge';
import { SearchAutocomplete } from './search-autocomplete';
import { Badge, buttonVariants } from '@/components/ui';
import { cityAccentClasses } from '@/lib/city-accent';
import { apiFetch } from '@/lib/api-client';
import { categoryHref } from '@/lib/urls';
import type { BrowseCategory } from '@/lib/types';

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z" />
    </svg>
  );
}

export function Header() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  const logout = useAuthStore((s) => s.logout);
  const { selectedCity, openSelector } = useCityStore();
  const wishlistCount = useWishlistStore((s) => s.count);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [categories, setCategories] = useState<BrowseCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const cityAcc = cityAccentClasses(selectedCity);

  function handleLogout() {
    setAccountMenuOpen(false);
    logout();
    router.push('/');
  }

  useEffect(() => {
    apiFetch<BrowseCategory[]>('/v1/browse/categories')
      .then((res) => {
        setCategories(res.data);
        setActiveCategoryId((current) => current ?? res.data[0]?.id ?? null);
      })
      .catch(() => {});
  }, []);

  // Unread-notification count for the account button + dropdown. Replaces the
  // standalone bell's signal; polls the cheap unread endpoint every 60s while
  // logged in (same cadence/endpoint the bell used — no extra request volume).
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    let active = true;
    const load = () =>
      apiFetch<{ unread: number }>('/v1/notifications/unread-count')
        .then((r) => {
          if (active) setUnreadCount(r.data.unread);
        })
        .catch(() => {});
    void load();
    const id = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [user]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (
        accountMenuRef.current &&
        event.target instanceof Node &&
        !accountMenuRef.current.contains(event.target)
      ) {
        setAccountMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountMenuOpen]);

  const activeCategory = useMemo(
    () => categories.find((cat) => cat.id === activeCategoryId) ?? categories[0],
    [activeCategoryId, categories],
  );

  const citySlug = selectedCity?.slug;
  const firstName = user?.firstName?.trim();
  const accountName = firstName || 'Mon compte';
  const closeMenus = () => {
    setMobileMenuOpen(false);
    setCategoryMenuOpen(false);
    setAccountMenuOpen(false);
  };

  const accountLinks = [
    { href: '/profil', label: 'Mon compte', count: 0 },
    { href: '/commandes', label: 'Mes commandes', count: 0 },
    { href: '/favoris', label: 'Mes favoris', count: wishlistCount },
    { href: '/notifications', label: 'Notifications', count: unreadCount },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-5">
        <div className="flex h-14 items-center gap-2 md:h-[72px] md:gap-3 lg:gap-4">
          <button
            type="button"
            onClick={() => {
              setAccountMenuOpen(false);
              setCategoryMenuOpen((open) => !open);
            }}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
            aria-label="Toutes les catégories"
            aria-expanded={categoryMenuOpen}
            aria-controls="desktop-category-menu"
            aria-haspopup="true"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link href="/" className="shrink-0" aria-label="Teka RDC — Accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt="Teka RDC"
              className="h-7 w-auto md:h-8 lg:h-9"
              width={132}
              height={28}
            />
          </Link>

          <button
            onClick={openSelector}
            className={`hidden h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-left transition-colors xl:flex ${
              selectedCity
                ? `${cityAcc.surface} hover:brightness-95`
                : 'text-foreground hover:bg-surface-muted'
            }`}
            title={selectedCity ? 'Changer de ville' : 'Choisissez votre ville'}
          >
            <PinIcon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 leading-tight">
              <span className="block max-w-[120px] truncate text-sm font-bold">
                {selectedCity ? selectedCity.name : 'Choisir une ville'}
              </span>
            </span>
            <svg className="ml-auto h-3 w-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div className="hidden md:flex min-w-[260px] flex-1">
            <SearchAutocomplete
              cityId={selectedCity?.id}
              citySlug={selectedCity?.slug}
              placeholder="Rechercher des produits..."
              categoryLabel="Catégories"
            />
          </div>

          <div className="hidden md:flex shrink-0 items-center gap-1.5 lg:gap-2">
            {authLoading ? (
              <div className="w-px" aria-hidden />
            ) : user ? (
              <>
                <div className="relative" ref={accountMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryMenuOpen(false);
                      setAccountMenuOpen((open) => !open);
                    }}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-left text-sm font-bold text-foreground shadow-xs transition-all hover:border-primary/35 hover:bg-primary-subtle hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-expanded={accountMenuOpen}
                    aria-haspopup="menu"
                    aria-controls="buyer-account-menu"
                  >
                    <span className="max-w-[112px] truncate lg:max-w-[150px]">
                      {firstName ? `Bonjour, ${firstName}` : accountName}
                    </span>
                    {unreadCount > 0 && (
                      <Badge
                        variant="discount"
                        size="sm"
                        className="min-w-5 justify-center px-1.5"
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Badge>
                    )}
                    <svg className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {accountMenuOpen && (
                    <div
                      id="buyer-account-menu"
                      role="menu"
                      className="absolute right-0 mt-3 w-64 origin-top-right rounded-2xl border border-border bg-white p-2 shadow-xl ring-1 ring-black/5"
                    >
                      <div className="border-b border-border px-3 py-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          {firstName ? 'Bonjour,' : 'Bienvenue'}
                        </p>
                        <p className="mt-0.5 truncate text-base font-bold text-foreground">
                          {accountName}
                        </p>
                      </div>
                      <div className="py-2">
                        {accountLinks.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            role="menuitem"
                            onClick={() => setAccountMenuOpen(false)}
                            className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted hover:text-primary"
                          >
                            <span>{item.label}</span>
                            {item.count > 0 && (
                              <Badge
                                variant="discount"
                                size="sm"
                                className="min-w-5 justify-center px-1.5"
                              >
                                {item.count > 99 ? '99+' : item.count}
                              </Badge>
                            )}
                          </Link>
                        ))}
                      </div>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleLogout}
                        className="w-full rounded-xl border-t border-border px-3 py-2 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                      >
                        {"Se déconnecter"}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link
                href="/connexion"
                className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-bold text-foreground shadow-xs transition-all hover:border-primary/35 hover:bg-primary-subtle hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {"Se connecter"}
              </Link>
            )}
            <CartBadge />
          </div>

          <div className="md:hidden ml-auto flex items-center gap-1">
            <CartBadge />
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden rounded-lg p-2 text-foreground hover:bg-surface-muted"
            aria-label="Menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {categoryMenuOpen && (
        <div
          id="desktop-category-menu"
          className="hidden md:block absolute left-0 right-0 top-full border-b border-border bg-white shadow-xl"
        >
          <div className="max-w-7xl mx-auto px-4 py-5">
            <div className="grid grid-cols-[260px_1fr] gap-5">
              <div className="rounded-xl border border-border bg-surface-muted/70 p-2">
                {/* Promotions relocated here from the top bar — kept discoverable
                    as a highlighted entry point above the category list. */}
                <Link
                  href="/promotions"
                  onClick={() => setCategoryMenuOpen(false)}
                  className="mb-2 flex items-center gap-2 rounded-lg bg-primary-subtle px-3 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  <span aria-hidden>🔥</span>
                  {"Promotions"}
                </Link>
                <Link
                  href="/categories"
                  onClick={() => setCategoryMenuOpen(false)}
                  className="mb-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-foreground transition-colors hover:bg-white hover:text-primary"
                >
                  {"Toutes les catégories"}
                  <span className="text-lg leading-none" aria-hidden>›</span>
                </Link>
                <div className="max-h-[420px] overflow-y-auto pr-1">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onMouseEnter={() => setActiveCategoryId(cat.id)}
                      onFocus={() => setActiveCategoryId(cat.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${
                        activeCategory?.id === cat.id
                          ? 'bg-white text-primary shadow-xs'
                          : 'text-foreground hover:bg-white'
                      }`}
                    >
                      <span className="block truncate">{cat.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-[320px] rounded-xl border border-border bg-surface p-5">
                {activeCategory ? (
                  <>
                    <div className="mb-4 flex items-start justify-between gap-4 border-b border-border pb-4">
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          {"Catégorie"}
                        </p>
                        <h2 className="mt-1 text-xl font-bold text-foreground">
                          {activeCategory.name}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {"Parcourez les sous-catégories et types de produits disponibles."}
                        </p>
                      </div>
                      <Link
                        href={categoryHref(citySlug, activeCategory)}
                        onClick={() => setCategoryMenuOpen(false)}
                        className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        {"Voir tout"}
                      </Link>
                    </div>
                    {activeCategory.subcategories.length > 0 ? (
                      <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-3">
                        {activeCategory.subcategories.slice(0, 9).map((sub) => (
                          <div key={sub.id} className="min-w-0">
                            <Link
                              href={categoryHref(citySlug, sub)}
                              onClick={() => setCategoryMenuOpen(false)}
                              className="block truncate text-sm font-bold text-foreground transition-colors hover:text-primary"
                            >
                              {sub.name}
                            </Link>
                            {sub.subcategories.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {sub.subcategories.slice(0, 5).map((type) => (
                                  <Link
                                    key={type.id}
                                    href={categoryHref(citySlug, type)}
                                    onClick={() => setCategoryMenuOpen(false)}
                                    className="block truncate text-sm text-muted-foreground transition-colors hover:text-primary"
                                  >
                                    {type.name}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl bg-surface-muted p-6 text-sm text-muted-foreground">
                        {"Cette catégorie n'a pas encore de sous-catégories publiées."}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl bg-surface-muted p-6 text-sm text-muted-foreground">
                    {"Chargement des catégories..."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-border px-3 py-2.5 md:hidden">
        <SearchAutocomplete
          cityId={selectedCity?.id}
          citySlug={selectedCity?.slug}
          placeholder="Rechercher des produits..."
          categoryLabel="Catégories"
        />
      </div>

      {mobileMenuOpen && (
        <div className="space-y-4 border-t border-border bg-white px-4 py-4 shadow-lg md:hidden">
          <button
            onClick={() => {
              openSelector();
              closeMenus();
            }}
            className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
              selectedCity
                ? `${cityAcc.surface} border-transparent`
                : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/50'
            }`}
          >
            <PinIcon className="h-4 w-4" />
            <span className="font-semibold">
              {selectedCity ? selectedCity.name : 'Choisissez votre ville'}
            </span>
            <svg className="ml-auto h-3 w-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <nav className="grid gap-1">
            {[
              { href: '/', label: 'Accueil' },
              { href: '/categories', label: 'Catégories' },
              { href: '/promotions', label: 'Promotions' },
              { href: '/lubumbashi', label: 'Lubumbashi' },
              { href: '/kolwezi', label: 'Kolwezi' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMenus}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {categories.length > 0 && (
            <div className="rounded-xl border border-border bg-surface-muted/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-foreground">
                  {"Explorer par catégorie"}
                </p>
                <Link
                  href="/categories"
                  onClick={closeMenus}
                  className="text-xs font-semibold text-primary"
                >
                  {"Voir tout"}
                </Link>
              </div>
              <div className="space-y-1">
                {categories.slice(0, 7).map((cat) => (
                  <details key={cat.id} className="group rounded-lg bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-foreground">
                      <span className="truncate">{cat.name}</span>
                      {cat.subcategories.length > 0 && (
                        <span className="text-muted-foreground transition-transform group-open:rotate-90" aria-hidden>
                          ›
                        </span>
                      )}
                    </summary>
                    {(cat.subcategories.length > 0 || cat.slug) && (
                      <div className="grid grid-cols-1 gap-1 border-t border-border px-3 py-2">
                        <Link
                          href={categoryHref(citySlug, cat)}
                          onClick={closeMenus}
                          className="truncate rounded-md px-2 py-1.5 text-sm font-semibold text-primary hover:bg-primary-subtle"
                        >
                          {"Voir toute la catégorie"}
                        </Link>
                        {cat.subcategories.slice(0, 5).map((sub) => (
                          <Link
                            key={sub.id}
                            href={categoryHref(citySlug, sub)}
                            onClick={closeMenus}
                            className="truncate rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-surface-muted hover:text-primary"
                          >
                            {sub.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </details>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            {authLoading ? null : user ? (
              <>
                <div className="rounded-xl bg-surface-muted px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {firstName ? 'Bonjour,' : 'Bienvenue'}
                  </p>
                  <p className="truncate text-base font-bold text-foreground">{accountName}</p>
                </div>
                {accountLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMenus}
                    className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted hover:text-primary"
                  >
                    <span>{item.label}</span>
                    {item.count > 0 && (
                      <Badge
                        variant="discount"
                        size="sm"
                        className="min-w-5 justify-center px-1.5"
                      >
                        {item.count > 99 ? '99+' : item.count}
                      </Badge>
                    )}
                  </Link>
                ))}
                <button
                  onClick={() => {
                    handleLogout();
                    closeMenus();
                  }}
                  className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                >
                  {"Se déconnecter"}
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href="/connexion"
                  onClick={closeMenus}
                  className={buttonVariants({ variant: 'default', size: 'md' })}
                >
                  {"Se connecter"}
                </Link>
                <Link
                  href="/reclamer-compte"
                  onClick={closeMenus}
                  className={buttonVariants({ variant: 'outline', size: 'md' })}
                >
                  {"Ancien compte ?"}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
