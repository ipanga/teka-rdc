'use client';

// PostHog client bootstrap for seller-web.
//
// Initialized once, gated on NEXT_PUBLIC_POSTHOG_KEY_SELLER_WEB — when the key
// is unset (e.g. local dev with an empty .env), posthog stays uninitialized
// and every capture/identify becomes a no-op. Same shape as the Sentry gate.
//
// Analytics traffic is proxied through the seller-web origin /ingest (see
// next.config.ts rewrites) so ad-blockers on DRC networks don't drop events.
// In production NEXT_PUBLIC_BASE_PATH is empty (the app serves at the
// seller.teka.cd root — see deploy.yml), so /ingest behaves exactly as on
// buyer-web. Pageviews are captured manually by PostHogPageview (App Router
// has no full page loads).
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { scrubPosthogEvent } from '@/lib/posthog-scrub';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY_SELLER_WEB;
    if (!key || posthog.__loaded) return;
    posthog.init(key, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      // Manual pageviews via PostHogPageview; App Router client navigations
      // don't trigger a full load so autodetection misses them.
      capture_pageview: false,
      capture_pageleave: true,
      persistence: 'localStorage+cookie',
      autocapture: true,
      // D4 (2026-09-06): no session replay on the seller portal — identity,
      // payout and verification data must never reach a recording, whatever
      // the project-side setting says. Events/pageviews are unaffected.
      disable_session_recording: true,
      session_recording: { maskAllInputs: true },
      before_send: (event) => scrubPosthogEvent(event),
    });
  }, []);

  // Tie analytics identity to the logged-in seller — id + role only, never
  // phone/email (Rule 10/13). reset() on logout clears the distinct id.
  const user = useAuthStore((s) => s.user);
  useEffect(() => {
    if (!posthog.__loaded) return;
    if (user) {
      posthog.identify(user.id, { role: user.role });
    } else {
      posthog.reset();
    }
  }, [user]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
