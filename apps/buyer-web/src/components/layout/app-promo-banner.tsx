'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  PROMO_HEIGHT_VAR,
  detectPromoPlatform,
  dismissPromo,
  isPromoDismissed,
  isPromoSuppressedPath,
  readDeviceEnv,
  type DeviceEnv,
  type PromoPlatform,
} from '@/lib/app-promo';

const STORE: Record<PromoPlatform, { href: string; store: string }> = {
  ios: { href: APP_STORE_URL, store: 'l’App Store' },
  android: { href: PLAY_STORE_URL, store: 'Google Play' },
};

/**
 * « Get the app » suggestion for signed-in buyers on phones (M1). Rules in
 * lib/app-promo.ts. Fixed to the bottom of the viewport so it is seen without
 * scrolling; mounted in the root layout, not the page flow. It appears only
 * after the session resolves, so nothing visible moves, and its height is
 * published as PROMO_HEIGHT_VAR so `body` and the product page's sticky bar
 * make room instead of being covered. z-30 keeps it under the header, filter
 * drawers and modals. Renders nothing on the server and on the first client
 * render → no SSR/SEO footprint, no hydration mismatch. No analytics: nothing
 * about the buyer is sent anywhere. Phone targeting is a heuristic (see
 * lib/app-promo.ts), not a guarantee.
 *
 * `deviceEnv` is a test seam; production reads the live device signals.
 */
export function AppPromoBanner({ deviceEnv }: { deviceEnv?: DeviceEnv }) {
  const pathname = usePathname();
  const isLoading = useAuthStore((s) => s.isLoading);
  const role = useAuthStore((s) => s.user?.role);
  const [platform, setPlatform] = useState<PromoPlatform | null>(null);
  const [dismissed, setDismissed] = useState(true); // until checked on the client
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const env = deviceEnv ?? readDeviceEnv();
    setPlatform(env ? detectPromoPlatform(env) : null);
    setDismissed(isPromoDismissed());
  }, [deviceEnv]);

  const visible = !isLoading && role === 'BUYER' && !!platform && !dismissed && !isPromoSuppressedPath(pathname);

  useEffect(() => {
    const el = ref.current;
    if (!visible || !el) return;
    const root = document.documentElement;
    const sync = () => root.style.setProperty(PROMO_HEIGHT_VAR, `${el.getBoundingClientRect().height}px`);
    sync();
    // Height follows wrapping, rotation and text zoom.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(PROMO_HEIGHT_VAR);
    };
  }, [visible]);

  if (!visible || !platform) return null;

  const { href, store } = STORE[platform];
  const hide = () => {
    dismissPromo();
    setDismissed(true);
  };

  return (
    <aside
      ref={ref}
      aria-label="Application mobile Teka RDC"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface shadow-lg"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center gap-2 py-2 pl-3 pr-1">
        {/* Decorative: the text names the app. Existing manifest icon. */}
        <img src="/app-icon.svg" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[9px]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-foreground">L’application Teka RDC</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground max-[359px]:hidden">
            Suivez vos commandes et achetez plus vite.
          </p>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={hide}
          aria-label={`Télécharger l’application Teka RDC sur ${store}`}
          className="inline-flex min-h-11 max-w-24 shrink-0 items-center rounded-lg bg-primary px-3 py-1 text-center text-xs font-semibold leading-tight text-white transition-colors hover:bg-primary-700"
        >
          Télécharger l’application
        </a>
        <button
          type="button"
          onClick={hide}
          aria-label="Masquer la suggestion d’application (30 jours)"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
