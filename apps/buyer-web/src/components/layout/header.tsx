'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useCityStore } from '@/lib/city-store';
import { CartBadge } from '@/components/cart/cart-badge';
import { WishlistBadge } from '@/components/wishlist/wishlist-badge';
import { SearchAutocomplete } from './search-autocomplete';
import { buttonVariants } from '@/components/ui';
import { cityAccentClasses } from '@/lib/city-accent';

// Location pin — small filled marker for the city selector.
function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z" />
    </svg>
  );
}

export function Header() {
  const t = useTranslations('Header');
  const tCity = useTranslations('City');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  const logout = useAuthStore((s) => s.logout);
  const { selectedCity, openSelector } = useCityStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Town accent for the city selector (copper = Lubumbashi, cobalt = Kolwezi).
  const cityAcc = cityAccentClasses(selectedCity?.slug);

  // Direct buyer↔seller messaging removed on 2026-05-17 — buyers now
  // contact Teka RDC support instead of the seller (see /contact). The
  // header messages icon + unread-count polling were removed with the
  // feature; the API endpoint returns 410 GONE if any old client still
  // calls /v1/messages/unread-count.

  function handleLogout() {
    logout();
    router.push('/');
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border shadow-sm">
      {/* Main header bar */}
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="shrink-0" aria-label="Teka RDC — Accueil">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="Teka RDC"
            className="h-8 w-auto"
            width={160}
            height={32}
          />
        </Link>

        {/* City selector \u2014 always present so no-city visitors keep an entry
            point (the homepage no longer force-opens the modal). Shows the
            chosen city, or a "choose a city" affordance. */}
        <button
          onClick={openSelector}
          className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm shrink-0 transition-colors ${
            selectedCity
              ? `${cityAcc.surface} border-transparent hover:brightness-95`
              : 'border-border text-foreground hover:border-primary/40 hover:bg-muted/50'
          }`}
          title={selectedCity ? tCity('changeCity') : tCity('selectCity')}
        >
          <PinIcon className="w-3.5 h-3.5" />
          <span className="font-semibold">
            {selectedCity ? selectedCity.name : tCity('selectCity')}
          </span>
          <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Search bar - desktop */}
        <div className="hidden md:flex flex-1 max-w-xl">
          <SearchAutocomplete
            cityId={selectedCity?.id}
            citySlug={selectedCity?.slug}
            placeholder={t('search')}
            categoryLabel={t('categories')}
          />
        </div>

        {/* Right side - desktop */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/categories"
            className="text-sm text-foreground hover:text-primary transition-colors"
          >
            {t('categories')}
          </Link>
          {authLoading ? (
            // Auth resolving — render nothing rather than the login button, so
            // a logged-in user on a slow connection can't click "connexion"
            // and get bounced home by the middleware (it still sees the cookie).
            <div className="w-px" aria-hidden />
          ) : user ? (
            <div className="flex items-center gap-3">
              <WishlistBadge />
              <Link
                href="/profil"
                className="text-sm text-foreground hover:text-primary transition-colors"
              >
                {user.firstName || t('myAccount')}
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('logout')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/connexion"
                className={buttonVariants({ variant: 'default', size: 'md' })}
              >
                {t('login')}
              </Link>
            </div>
          )}
          <CartBadge />
        </div>

        {/* Mobile icons (always visible) */}
        <div className="md:hidden ml-auto flex items-center gap-1">
          <WishlistBadge compact />
          <CartBadge />
        </div>

        {/* Hamburger - mobile */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-foreground"
          aria-label={t('menu')}
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

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-white px-4 py-4 space-y-4">
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
              {selectedCity ? selectedCity.name : tCity('selectCity')}
            </span>
            <svg className="w-3 h-3 opacity-70 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Mobile search */}
          <SearchAutocomplete
            cityId={selectedCity?.id}
            citySlug={selectedCity?.slug}
            placeholder={t('search')}
            categoryLabel={t('categories')}
            onNavigate={() => setMobileMenuOpen(false)}
          />

          {/* Mobile nav links */}
          <nav className="flex flex-col gap-3">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-foreground hover:text-primary transition-colors"
            >
              {t('home')}
            </Link>
            <Link
              href="/categories"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-foreground hover:text-primary transition-colors"
            >
              {t('categories')}
            </Link>
          </nav>

          {/* Mobile auth */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border">
            {authLoading ? null : user ? (
              <>
                <Link
                  href="/profil"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm text-foreground hover:text-primary transition-colors"
                >
                  {user.firstName || t('myAccount')}
                </Link>
                <Link
                  href="/favoris"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                  </svg>
                  {t('wishlist')}
                </Link>
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="text-sm text-left text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('logout')}
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href="/connexion"
                  onClick={() => setMobileMenuOpen(false)}
                  className={buttonVariants({ variant: 'default', size: 'md' })}
                >
                  {t('login')}
                </Link>
                <Link
                  href="/reclamer-compte"
                  onClick={() => setMobileMenuOpen(false)}
                  className={buttonVariants({ variant: 'outline', size: 'md' })}
                >
                  {t('claim')}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
