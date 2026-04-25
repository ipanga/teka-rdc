'use client';

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useCityStore } from '@/lib/city-store';
import { LanguageSwitcher } from './language-switcher';
import { CartBadge } from '@/components/cart/cart-badge';
import { apiFetch } from '@/lib/api-client';

export function Header() {
  const t = useTranslations('Header');
  const tCity = useTranslations('City');
  const locale = useLocale();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { selectedCity, openSelector } = useCityStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch<{ count: number }>('/v1/messages/unread-count');
      setUnreadCount(res.data.count);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    fetchUnreadCount();
    unreadPollRef.current = setInterval(fetchUnreadCount, 30000);
    return () => {
      if (unreadPollRef.current) clearInterval(unreadPollRef.current);
    };
  }, [fetchUnreadCount]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
      setMobileMenuOpen(false);
    }
  }

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

        {/* City selector */}
        {selectedCity && (
          <button
            onClick={openSelector}
            className="hidden md:flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/50 transition-colors text-sm shrink-0"
            title={tCity('changeCity')}
          >
            <span className="text-xs">{'\uD83D\uDCCD'}</span>
            <span className="font-medium text-foreground">
              {(locale === 'en' && selectedCity.name.en) ? selectedCity.name.en : selectedCity.name.fr}
              {selectedCity.province && <span className="text-muted-foreground font-normal">, {selectedCity.province}</span>}
            </span>
            <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        {/* Search bar - desktop */}
        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-xl">
          <div className="relative w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search')}
              className="w-full pl-10 pr-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </form>

        {/* Right side - desktop */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/categories"
            className="text-sm text-foreground hover:text-primary transition-colors"
          >
            {t('categories')}
          </Link>
          {user ? (
            <div className="flex items-center gap-3">
              {/* Wishlist icon */}
              <Link
                href="/wishlist"
                className="relative p-2 text-foreground hover:text-primary transition-colors"
                aria-label="Wishlist"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                  />
                </svg>
              </Link>
              {/* Messages icon */}
              <Link
                href="/messages"
                className="relative p-2 text-foreground hover:text-primary transition-colors"
                aria-label="Messages"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                  />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-primary rounded-full">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
              <span className="text-sm text-foreground">
                {user.firstName || t('myAccount')}
              </span>
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
                href="/login"
                className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                {t('login')}
              </Link>
              <Link
                href="/register"
                className="text-sm px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                {t('register')}
              </Link>
            </div>
          )}
          <CartBadge />
          <LanguageSwitcher />
        </div>

        {/* Mobile icons (always visible) */}
        <div className="md:hidden ml-auto flex items-center gap-1">
          {user && (
            <>
              <Link
                href="/wishlist"
                className="relative p-1.5 text-foreground hover:text-primary transition-colors"
                aria-label="Wishlist"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
              </Link>
              <Link
                href="/messages"
                className="relative p-1.5 text-foreground hover:text-primary transition-colors"
                aria-label="Messages"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[9px] font-bold text-white bg-primary rounded-full">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
            </>
          )}
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
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/50 transition-colors text-sm"
          >
            <span className="text-xs">{'\uD83D\uDCCD'}</span>
            {selectedCity ? (
              <span className="font-medium text-foreground">
                {(locale === 'en' && selectedCity.name.en) ? selectedCity.name.en : selectedCity.name.fr}
                {selectedCity.province && <span className="text-muted-foreground font-normal">, {selectedCity.province}</span>}
              </span>
            ) : (
              <span className="text-muted-foreground">{tCity('selectCity')}</span>
            )}
            <svg className="w-3 h-3 text-muted-foreground ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Mobile search */}
          <form onSubmit={handleSearch}>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search')}
                className="w-full pl-10 pr-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </form>

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
            {user ? (
              <>
                <span className="text-sm text-foreground">
                  {user.firstName || t('myAccount')}
                </span>
                <Link
                  href="/wishlist"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                  </svg>
                  {t('wishlist')}
                </Link>
                <Link
                  href="/messages"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                  </svg>
                  {t('messages')}
                  {unreadCount > 0 && (
                    <span className="flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-primary rounded-full">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
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
              <div className="flex gap-2">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 text-sm text-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  {t('login')}
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 text-sm text-center px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  {t('register')}
                </Link>
              </div>
            )}
          </div>

          {/* Language switcher */}
          <div className="pt-2 border-t border-border">
            <LanguageSwitcher />
          </div>
        </div>
      )}
    </header>
  );
}
