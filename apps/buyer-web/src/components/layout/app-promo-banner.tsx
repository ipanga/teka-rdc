'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  detectPromoPlatform,
  dismissPromo,
  isPromoDismissed,
  isPromoSuppressedPath,
  readDeviceEnv,
  type DeviceEnv,
  type PromoPlatform,
} from '@/lib/app-promo';
import { Container } from '@/components/ui';

const STORE: Record<PromoPlatform, { href: string; store: string }> = {
  ios: { href: APP_STORE_URL, store: 'l’App Store' },
  android: { href: PLAY_STORE_URL, store: 'Google Play' },
};

/**
 * « Get the app » suggestion for signed-in buyers on phones (M1). Rules in
 * lib/app-promo.ts. Rendered in-flow just above the footer (mounted by
 * <Footer>): it appears only after the session resolves, so placing it at the
 * top would push the page down — here nothing visible moves and nothing
 * overlays the sticky header, cart or checkout. Renders nothing on the server
 * and on the first client render → no SSR/SEO footprint, no hydration
 * mismatch. No analytics: nothing about the buyer is sent anywhere. Phone
 * targeting is a heuristic (see lib/app-promo.ts), not a guarantee.
 *
 * `deviceEnv` is a test seam; production reads the live device signals.
 */
export function AppPromoBanner({ deviceEnv }: { deviceEnv?: DeviceEnv }) {
  const pathname = usePathname();
  const isLoading = useAuthStore((s) => s.isLoading);
  const role = useAuthStore((s) => s.user?.role);
  const [platform, setPlatform] = useState<PromoPlatform | null>(null);
  const [dismissed, setDismissed] = useState(true); // until checked on the client

  useEffect(() => {
    const env = deviceEnv ?? readDeviceEnv();
    setPlatform(env ? detectPromoPlatform(env) : null);
    setDismissed(isPromoDismissed());
  }, [deviceEnv]);

  if (isLoading || role !== 'BUYER' || !platform || dismissed || isPromoSuppressedPath(pathname)) {
    return null;
  }

  const { href, store } = STORE[platform];
  const hide = () => {
    dismissPromo();
    setDismissed(true);
  };

  return (
    <aside aria-label="Application mobile Teka RDC" className="mt-8 mb-6">
      <Container>
        <div className="flex items-start gap-3 rounded-xl border border-primary-100 bg-primary-50 p-3">
          {/* Decorative: the text names the app. Existing manifest icon. */}
          <img src="/app-icon.svg" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-[10px]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">L’application Teka RDC</p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
              Suivez vos commandes et achetez plus vite depuis votre téléphone.
            </p>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={hide}
              aria-label={`Télécharger l’application Teka RDC sur ${store}`}
              className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              Télécharger l’application
            </a>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Déjà installée ? Ouvrez-la depuis votre écran d’accueil.
            </p>
          </div>
          <button
            type="button"
            onClick={hide}
            aria-label="Masquer la suggestion d’application (30 jours)"
            className="-mr-1 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary-100 hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </Container>
    </aside>
  );
}
