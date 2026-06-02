# Analytics — PostHog (buyer-web)

`apps/buyer-web` uses [PostHog](https://posthog.com) for product analytics,
session replay, and feature flags. It is wired into the consumer storefront
only — `seller-web` and `admin-web` have no PostHog (the pattern below is
copy-paste if that ever changes).

## What's captured

| Capability | How |
|---|---|
| **Page views** | Manual `$pageview` on every App Router navigation — `src/components/providers/posthog-pageview.tsx` (uses `usePathname`/`useSearchParams`, so it lives inside a `<Suspense>` boundary in `layout.tsx`). |
| **Autocapture** | Clicks, form submits, etc. captured automatically by `posthog-js`. |
| **Session replay** | Enabled with `maskAllInputs: true` — every `<input>` is masked. |
| **Feature flags** | Loaded automatically on init; evaluated client-side. |
| **User identity** | `posthog.identify(user.id, { role })` on login, `posthog.reset()` on logout — keyed off the Zustand auth store. **id + role only; never phone or email.** |

## Configuration

Single env var — the publishable PostHog **project API key**:

```
NEXT_PUBLIC_POSTHOG_KEY_BUYER_WEB=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- Get it from **PostHog → Project Settings → Project API Key** (US Cloud region).
- It is a **publishable** key — public by design (it ships in the browser
  bundle). It is not a secret, but it's still env-driven so dev stays empty and
  keys can rotate per environment.
- `NEXT_PUBLIC_*` is **compile-time only**, so it must be present at *build*
  time, not runtime.

### Where it lives per environment

| Environment | Source |
|---|---|
| **Local dev** | Root `.env.development` (leave empty unless testing). |
| **Production** | GitHub Secret `NEXT_PUBLIC_POSTHOG_KEY_BUYER_WEB` → passed as a Docker build-arg in `.github/workflows/deploy.yml` → `ARG`/`ENV` in `apps/buyer-web/Dockerfile`. **Not** a runtime/compose var (same handling as the `NEXT_PUBLIC_SENTRY_DSN_*` client DSNs). |

**When the key is empty, PostHog never initializes** and every `capture` /
`identify` is a no-op — identical to the Sentry DSN gate. Dev is silent by
default.

> Ops action when provisioning: add the repo secret
> `NEXT_PUBLIC_POSTHOG_KEY_BUYER_WEB` so prod builds bake the key in.

## Reverse proxy (`/ingest`)

The browser never calls `*.posthog.com` directly. `posthog-js` is configured
with `api_host: '/ingest'`, and `apps/buyer-web/next.config.ts` rewrites
`/ingest/*` to PostHog US Cloud:

```
/ingest/static/:path*  → https://us-assets.i.posthog.com/static/:path*
/ingest/:path*         → https://us.i.posthog.com/:path*
/ingest/flags          → https://us.i.posthog.com/flags
```

This keeps analytics same-origin (`teka.cd/ingest`) so ad-blockers — common on
DRC networks — don't drop events. `skipTrailingSlashRedirect: true` is required
in `next.config.ts` for PostHog's API paths. No nginx change is needed
(`teka.cd` already routes to buyer-web), and the service worker doesn't cache
`/ingest` (captures are POST; `/ingest/static` GETs fall through to
network-first).

## Using a feature flag

```tsx
'use client';
import { useFeatureFlagEnabled } from 'posthog-js/react';

export function CheckoutButton() {
  const showNewCheckout = useFeatureFlagEnabled('new-checkout');
  return showNewCheckout ? <NewCheckout /> : <LegacyCheckout />;
}
```

Create and target flags in the PostHog dashboard. No extra app wiring is needed —
flags load on init.

## Privacy (Rule 10 / Rule 15: never log phone numbers)

- **Session replay** masks all inputs (`maskAllInputs: true`). For a sensitive
  **non-input** element, add the `ph-no-capture` class.
- **Event scrubbing**: `posthog.init` uses `before_send: scrubPosthogEvent`
  (`src/lib/posthog-scrub.ts`), which strips `+243XXXXXXXXX` phone patterns from
  event properties (incl. `$current_url`, `$referrer`). Mirrors
  `apps/buyer-web/sentry-scrub.ts` — keep the regex in sync if either changes.
- **Identity** carries `user.id` + `role` only.

## Key files

```
apps/buyer-web/
├── src/lib/posthog-scrub.ts                       # phone scrubber (before_send)
├── src/components/providers/posthog-provider.tsx  # init + identify/reset
├── src/components/providers/posthog-pageview.tsx  # manual $pageview
├── src/app/layout.tsx                             # provider wiring (+ <Suspense>)
├── next.config.ts                                 # /ingest rewrites
└── Dockerfile                                     # NEXT_PUBLIC_POSTHOG_KEY_BUYER_WEB ARG/ENV
.github/workflows/deploy.yml                       # build-arg from GitHub Secret
.env.{example,development,production}              # env documentation
```

## Deferred (not implemented)

- seller-web / admin-web integration.
- Server-side flag bootstrapping (`posthog-node`) to remove first-paint flag flicker.
- Custom event taxonomy beyond autocapture + pageviews.
- Linking PostHog session replays to Sentry errors.
