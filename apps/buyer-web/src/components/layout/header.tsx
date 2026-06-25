'use client';

import { useState } from 'react';
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

        {/* Town selector \u2014 Amazon-style "Livrer \u00e0 {ville}" delivery-location
            picker. Always present so no-town visitors keep an entry point.
            Two-line affordance: a small "Livrer \u00e0" prefix over the town name. */}
        <button
          onClick={openSelector}
          className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border shrink-0 transition-colors ${
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
        <div className="hidden md:flex flex-1 max-w-xl">
          <SearchAutocomplete
            cityId={selectedCity?.id}
            citySlug={selectedCity?.slug}
            placeholder={"Rechercher des produits..."}
            categoryLabel={"Catégories"}
          />
        </div>

        {/* Right side - desktop */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/categories"
            className="text-sm text-foreground hover:text-primary transition-colors"
          >
            {"Catégories"}
          </Link>
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
              {selectedCity ? selectedCity.name : "Choisissez votre ville"}
            </span>
            <svg className="w-3 h-3 opacity-70 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Mobile nav links */}
          <nav className="flex flex-col gap-3">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-foreground hover:text-primary transition-colors"
            >
              {"Accueil"}
            </Link>
            <Link
              href="/categories"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-foreground hover:text-primary transition-colors"
            >
              {"Catégories"}
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
