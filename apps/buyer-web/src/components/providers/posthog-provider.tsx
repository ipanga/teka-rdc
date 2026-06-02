'use client';

// PostHog client bootstrap for buyer-web.
//
// Initialized once, gated on NEXT_PUBLIC_POSTHOG_KEY_BUYER_WEB — when the key
// is unset (e.g. local dev with an empty .env), posthog stays uninitialized
// and every capture/identify becomes a no-op. Same shape as the Sentry gate in
// instrumentation-client.ts.
//
// Analytics traffic is proxied through teka.cd/ingest (see next.config.ts
// rewrites) so ad-blockers on DRC networks don't drop events. Pageviews are
// captured manually by PostHogPageview (App Router has no full page loads).
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { scrubPosthogEvent } from '@/lib/posthog-scrub';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY_BUYER_WEB;
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
      // Mask every <input> in replays — phone, address, password (Rule 10/15).
      session_recording: { maskAllInputs: true },
      before_send: (event) => scrubPosthogEvent(event),
    });
  }, []);

  // Tie analytics identity to the logged-in user — id + role only, never
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
