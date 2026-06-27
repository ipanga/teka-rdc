'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useCityStore } from '@/lib/city-store';
import { CartBadge } from '@/components/cart/cart-badge';
import { WishlistBadge } from '@/components/wishlist/wishlist-badge';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { SearchAutocomplete } from './search-autocomplete';
import { buttonVariants } from '@/components/ui';
import { cityAccentClasses } from '@/lib/city-accent';
import { apiFetch } from '@/lib/api-client';
import { categoryHref } from '@/lib/urls';
import type { BrowseCategory } from '@/lib/types';

// Location pin — small filled marker for the city selector.
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [categories, setCategories] = useState<BrowseCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  // Town accent for the city selector — driven by the city record's accentColor
  // (data-driven; copper / cobalt / brand-red default).
  const cityAcc = cityAccentClasses(selectedCity);

  // Direct buyer↔seller messaging removed on 2026-05-17 — buyers now
  // contact Teka RDC support instead of the seller (see /contact). The
  // header messages icon + unread-count polling were removed with the
  // feature; the API endpoint returns 410 GONE if any old client still
  // calls /v1/messages/unread-count.

  function handleLogout() {
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

  const activeCategory = useMemo(
    () => categories.find((cat) => cat.id === activeCategoryId) ?? categories[0],
    [activeCategoryId, categories],
  );

  const citySlug = selectedCity?.slug;
  const closeMenus = () => {
    setMobileMenuOpen(false);
    setCategoryMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 border-b border-border shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90">
      {/* Main header bar */}
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="shrink-0" aria-label="Teka RDC — Accueil">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="Teka RDC"
            className="h-9 w-auto"
            width={160}
            height={32}
          />
        </Link>

        {/* Town selector \u2014 Amazon-style "Livrer \u00e0 {ville}" delivery-location
            picker. Always present so no-town visitors keep an entry point.
            Two-line affordance: a small "Livrer \u00e0" prefix over the town name. */}
        <button
          onClick={openSelector}
          className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border shrink-0 transition-colors shadow-xs ${
            selectedCity
              ? `${cityAcc.surface} border-transparent hover:brightness-95`
              : 'border-border text-foreground hover:border-primary/40 hover:bg-muted/50'
          }`}
          title={selectedCity ? "Changer de ville" : "Choisissez votre ville"}
        >
          <PinIcon className="w-4 h-4 shrink-0" />
          <span className="flex flex-col items-start leading-tight text-left">
            <span className="text-[10px] font-medium opacity-80">
              {"Livrer à"}
            </span>
            <span className="text-sm font-bold -mt-0.5">
              {selectedCity ? selectedCity.name : "Choisir une ville"}
            </span>
          </span>
          <svg className="w-3 h-3 opacity-70 self-end mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Search bar - desktop */}
        <div className="hidden md:flex flex-1 max-w-2xl">
          <SearchAutocomplete
            cityId={selectedCity?.id}
            citySlug={selectedCity?.slug}
            placeholder={"Rechercher des produits..."}
            categoryLabel={"Catégories"}
          />
        </div>

        {/* Right side - desktop */}
        <div className="hidden md:flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCategoryMenuOpen((open) => !open)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-foreground hover:bg-surface-muted hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-expanded={categoryMenuOpen}
            aria-controls="desktop-category-menu"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            {"Catégories"}
            <svg className={`w-3.5 h-3.5 transition-transform ${categoryMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {authLoading ? (
            // Auth resolving — render nothing rather than the login button, so
            // a logged-in user on a slow connection can't click "connexion"
            // and get bounced home by the middleware (it still sees the cookie).
            <div className="w-px" aria-hidden />
          ) : user ? (
            <div className="flex items-center gap-3">
              <NotificationBell />
              <WishlistBadge />
              <Link
                href="/profil"
                className="text-sm text-foreground hover:text-primary transition-colors"
              >
                {user.firstName || "Mon compte"}
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {"Se déconnecter"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/connexion"
                className={buttonVariants({ variant: 'default', size: 'md' })}
              >
                {"Se connecter"}
              </Link>
            </div>
          )}
          <CartBadge />
        </div>

        {/* Mobile icons (always visible) */}
        <div className="md:hidden ml-auto flex items-center gap-1">
          <NotificationBell compact />
          <WishlistBadge compact />
          <CartBadge />
        </div>

        {/* Hamburger - mobile */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-foreground"
          aria-label={"Menu"}
        >
          {mobileMenuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Persistent mobile search bar — always visible (sticky with the header).
          Search is the #1 marketplace action; keeping it out of the hamburger
          removes two taps. Desktop has its own inline search above. */}
      <nav className="hidden md:block border-t border-border/70 bg-surface-muted/45">
        <div className="max-w-7xl mx-auto px-4 h-10 flex items-center justify-between gap-6">
          <div className="flex items-center gap-1">
            {[
              { href: '/', label: 'Accueil' },
              { href: '/lubumbashi', label: 'Lubumbashi' },
              { href: '/kolwezi', label: 'Kolwezi' },
              { href: '/promotions', label: 'Promotions' },
              { href: '/categories', label: 'Toutes les catégories' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-white hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Paiement à la livraison
            </span>
            <Link href="/aide" className="hover:text-primary transition-colors">
              Aide
            </Link>
          </div>
        </div>
      </nav>

      {categoryMenuOpen && (
        <div
          id="desktop-category-menu"
          className="hidden md:block absolute left-0 right-0 top-full border-b border-border bg-white shadow-xl"
        >
          <div className="max-w-7xl mx-auto px-4 py-5">
            <div className="grid grid-cols-[260px_1fr] gap-5">
              <div className="rounded-xl border border-border bg-surface-muted/70 p-2">
                <Link
                  href="/categories"
                  onClick={() => setCategoryMenuOpen(false)}
                  className="mb-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-foreground hover:bg-white hover:text-primary transition-colors"
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
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate">{cat.name}</span>
                        <span className="text-xs font-medium text-muted-foreground">
                          {cat.productCount}
                        </span>
                      </span>
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
                        className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        {"Voir tout"}
                      </Link>
                    </div>
                    {activeCategory.subcategories.length > 0 ? (
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
                        {activeCategory.subcategories.slice(0, 9).map((sub) => (
                          <div key={sub.id} className="min-w-0">
                            <Link
                              href={categoryHref(citySlug, sub)}
                              onClick={() => setCategoryMenuOpen(false)}
                              className="block truncate text-sm font-bold text-foreground hover:text-primary transition-colors"
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
                                    className="block truncate text-sm text-muted-foreground hover:text-primary transition-colors"
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

      <div className="md:hidden border-t border-border px-4 py-2.5">
        <SearchAutocomplete
          cityId={selectedCity?.id}
          citySlug={selectedCity?.slug}
          placeholder={"Rechercher des produits..."}
          categoryLabel={"Catégories"}
        />
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-white px-4 py-4 space-y-4 shadow-lg">
          {/* Mobile city selector */}
          <button
            onClick={() => {
              openSelector();
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
              selectedCity
                ? `${cityAcc.surface} border-transparent`
                : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/50'
            }`}
          >
            <PinIcon className="w-4 h-4" />
            <span className="font-semibold">
              {selectedCity ? selectedCity.name : "Choisissez votre ville"}
            </span>
            <svg className="w-3 h-3 opacity-70 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Mobile nav links */}
          <nav className="flex flex-col gap-3">
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
                className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-muted hover:text-primary transition-colors"
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

          {/* Mobile auth */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border">
            {authLoading ? null : user ? (
              <>
                <Link
                  href="/profil"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm text-foreground hover:text-primary transition-colors"
                >
                  {user.firstName || "Mon compte"}
                </Link>
                <Link
                  href="/favoris"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                  </svg>
                  {"Liste de souhaits"}
                </Link>
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="text-sm text-left text-muted-foreground hover:text-foreground transition-colors"
                >
                  {"Se déconnecter"}
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href="/connexion"
                  onClick={() => setMobileMenuOpen(false)}
                  className={buttonVariants({ variant: 'default', size: 'md' })}
                >
                  {"Se connecter"}
                </Link>
                <Link
                  href="/reclamer-compte"
                  onClick={() => setMobileMenuOpen(false)}
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
