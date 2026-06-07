# Analytics — PostHog (platform-wide)

Teka RDC uses [PostHog](https://posthog.com) (US Cloud) for product analytics,
session replay, and feature flags across **all six surfaces**: the API and the
three Next.js apps + the two Flutter apps. Microsoft Clarity (heatmaps +
recordings) runs separately on buyer-web + seller-web — see `docs/clarity.md`.

> **One PostHog project.** Every surface sends to the same project with the same
> publishable `phc_…` key; events are separated by an `environment` property
> (and, server-side, an explicit tag). `distinctId` is always the public
> `user.id`, so a person's web, mobile, and server events stitch into one
> profile.

## Coverage at a glance

| Surface | SDK | What it sends |
|---|---|---|
| **api** | `posthog-node` | Authoritative **server-owned** events (auth, orders, payments, admin) |
| **buyer-web** | `posthog-js` | Pageviews, autocapture, session replay, + **buyer UI-intent events** |
| **seller-web** | `posthog-js` | Pageviews, autocapture, session replay, identity |
| **admin-web** | `posthog-js` | Pageviews, autocapture, session replay, identity |
| **buyer-mobile** | `posthog_flutter` | Screen views, app-lifecycle, identity, + client ecommerce events (product/category/search/cart/checkout/wishlist) |
| **seller-mobile** | `posthog_flutter` | Screen views, app-lifecycle events, identity |

## Architecture

### Event ownership (no duplication)

Every event has **exactly one authoritative owner**. The rule: **transactional
events fire server-side** (immune to ad-blockers — common on DRC networks — and
fire even if the client drops mid-flow); **UI-intent events fire client-side.**
Never emit the same event name from two layers.

- **Server (api / `posthog-node`)** owns: `user_registered`, `user_login`,
  `admin_login`, `seller_registered`, `password_reset_requested/completed`,
  `order_created`, `order_confirmed/processing/shipped/out_for_delivery/`
  `delivered/cancelled`, `payment_attempted/completed/failed`,
  `seller_approved/rejected`, `product_created/updated`, `product_moderated`,
  `broadcast_sent`.
- **buyer-web (client)** owns: `product_viewed`, `category_viewed`,
  `search_performed`, `add_to_cart`, `remove_from_cart`, `checkout_started`,
  `wishlist_added`, `wishlist_removed`, `wishlist_viewed`,
  `wishlist_item_moved_to_cart` — plus `$pageview` (manual).
- **seller-web / admin-web** own pageviews + autocapture + identity only (their
  domain actions are server-owned).
- **buyer-mobile** owns `$screen` (auto via `PosthogObserver`) + app-lifecycle +
  identity + the full **client ecommerce event set** (same names as buyer-web,
  fired via `PosthogAnalytics.capture`, ids/counts only): `product_viewed`,
  `category_viewed`, `search_performed` (query scrubbed via `scrubAnalyticsText`),
  `add_to_cart`, `remove_from_cart`, `checkout_started`, and the wishlist events
  (`wishlist_added`/`wishlist_removed`/`wishlist_viewed`/
  `wishlist_item_moved_to_cart`). **seller-mobile** is infra-only.

`api_error` and `notification_sent` are **intentionally not** captured —
`api_error` stays Sentry's job; `notification_sent` is too high-volume.

### Where it lives in code

```
apps/api/src/analytics/
  posthog.service.ts            # PostHogService: gated init, capture(), identify(), scrub, flush
  analytics.module.ts           # @Global module (inject PostHogService anywhere)
apps/api/src/config/env.validation.ts   # POSTHOG_API_KEY + POSTHOG_HOST (Joi)
# capture() call sites: auth/, checkout/, orders/, admin/, products/, broadcasts/

apps/buyer-web/src/
  lib/analytics.ts                              # typed track() helper (buyer events)
  components/providers/posthog-provider.tsx     # init + identify/reset
  components/providers/posthog-pageview.tsx     # manual $pageview (in <Suspense>)
  lib/posthog-scrub.ts                          # before_send phone scrub
apps/{seller,admin}-web/src/                    # same provider/pageview/scrub, no track() yet
apps/*/next.config.ts                           # /ingest rewrites + skipTrailingSlashRedirect
apps/*/Dockerfile                               # NEXT_PUBLIC_POSTHOG_KEY_<APP> build-arg

apps/{buyer,seller}-mobile/lib/
  core/analytics/posthog_analytics.dart   # identify/reset wrapper (id+role only) + buildIdentityProperties
  core/config/flavor.dart                 # posthogApiKey (per-flavor --dart-define)
  main.dart                               # gated Posthog().setup()
  app.dart                                # ref.listen(authProvider) → identify/reset
  core/router/app_router.dart             # PosthogObserver on GoRouter
```

## Configuration / environment variables

| Var | Surface | Kind | Notes |
|---|---|---|---|
| `POSTHOG_API_KEY` | api | **runtime secret** | Same `phc_…` value. Empty → `PostHogService` no-op. Exported by `deploy.yml` → `${POSTHOG_API_KEY:-}` on the api service in `docker-compose.prod.yml`. |
| `POSTHOG_HOST` | api | runtime | Defaults `https://us.i.posthog.com`. |
| `NEXT_PUBLIC_POSTHOG_KEY_BUYER_WEB` | buyer-web | build-time | Baked into the bundle (Docker build-arg from the GitHub Secret). Empty → no-op. |
| `NEXT_PUBLIC_POSTHOG_KEY_SELLER_WEB` | seller-web | build-time | Same. |
| `NEXT_PUBLIC_POSTHOG_KEY_ADMIN_WEB` | admin-web | build-time | Same. |
| `POSTHOG_API_KEY` (flavor JSON) | mobile | compile-time | Per-flavor `--dart-define-from-file=flavors/*.json`. Empty in dev/staging; prod injected at build like `SENTRY_DSN`. |

All keys hold the **same publishable `phc_…` project key**. It's public by design
(it ships in browser bundles / APKs); env-driving it just keeps dev empty and
allows rotation.

### Reverse proxy (`/ingest`) — web only

The three web apps set `api_host: '/ingest'` and rewrite `/ingest/*` to PostHog
US Cloud in `next.config.ts`, so analytics stay same-origin and ad-blockers
don't drop them. In production all three apps run at their subdomain root
(`NEXT_PUBLIC_BASE_PATH` is empty), so `/ingest` works identically across them.
`skipTrailingSlashRedirect: true` is required. **Mobile has no proxy** — the
Flutter SDK talks to `us.i.posthog.com` directly.

## User identification

`identify(user.id, { role })` on login; `reset()` on logout. **`id` + `role`
ONLY — never phone, email, or names (Rule 13).**

- **Web:** the provider keys off the Zustand auth store (`posthog-provider.tsx`).
- **Mobile:** centralized in `app.dart` via `ref.listen(authProvider)`; the
  property map is built by the unit-tested pure helper
  `buildIdentityProperties` (asserts no PII leaks).
- **Server:** every `capture(user.id, …)` uses the same `user.id`, so server
  events attach to the same person the client identified. Anonymous→identified
  merging is automatic on the client `identify`.

## Privacy & security

- **Never** send passwords, OTP codes, JWT/refresh tokens, session cookies,
  payment secrets, or raw DB ids other than the public `user.id`/`orderId`.
- **Phone scrubbing:** `+243\d{9}` is stripped from event properties — web via
  `before_send: scrubPosthogEvent`, api via `PostHogService`'s scrub. Keep these
  regexes in sync with the Sentry scrubbers (`sentry-scrub.ts`,
  `instrument.ts`). Mobile identify sends only `role`, so no scrub is needed
  there yet; add one if/when mobile captures free-text properties.
- **Session replay (web):** `maskAllInputs: true` masks every `<input>`. Add the
  `ph-no-capture` class to any sensitive non-input element.

## Environment strategy

One production PostHog project. Dev/staging keep their keys **empty** so local
runs never pollute prod analytics (the same gate as `SENTRY_DSN`). Every event
carries an `environment` value (api: `SENTRY_ENVIRONMENT`/`NODE_ENV`; web: build
env; mobile: `FlavorConfig.envName`) so prod/staging/dev stay filterable in the
PostHog UI even if a key were reused.

## Using a feature flag (web)

```tsx
'use client';
import { useFeatureFlagEnabled } from 'posthog-js/react';
export function CheckoutButton() {
  return useFeatureFlagEnabled('new-checkout') ? <NewCheckout /> : <LegacyCheckout />;
}
```
Flags load on init; create + target them in the PostHog dashboard. (No
server-side flag bootstrap yet — first-paint flag flicker is possible if flags
gate above-the-fold UI.)

## Debugging

- **Nothing showing up?** Confirm the key is set for that surface (empty = no-op
  by design). Web: check the bundle has `NEXT_PUBLIC_POSTHOG_KEY_*`; api: check
  `POSTHOG_API_KEY` reached the container (`docker exec … env | grep POSTHOG`);
  mobile: the flavor JSON's `POSTHOG_API_KEY`.
- **Web events blocked?** Verify `/ingest/*` returns 200 (same-origin proxy). An
  ad-blocker hitting `*.posthog.com` directly means `api_host` regressed.
- **PostHog Live Events** (dashboard) is the fastest confirmation; filter by
  `environment`.
- **Server events:** `PostHogService` logs an init line and a warn when the key
  is unset. It's fire-and-forget — capture failures are logged, never thrown.
- **Mobile:** run a dev build with a real key temporarily and watch Live Events;
  `$screen` should fire on navigation, identity on login.

## Production go-live checklist

- [ ] GitHub Secrets set: `POSTHOG_API_KEY` (api) + `NEXT_PUBLIC_POSTHOG_KEY_`
      `{BUYER,SELLER,ADMIN}_WEB` (all the same `phc_…` value).
- [ ] Mobile prod flavor `POSTHOG_API_KEY` injected at build (CI), like `SENTRY_DSN`.
- [ ] Deploy: web keys bake into the bundles; api key loads into the container.
- [ ] Verify Live Events from each surface (filter `environment = production`).
- [ ] Build the core funnels (e.g. `product_viewed → add_to_cart →`
      `checkout_started → order_created → order_delivered`).

## Post-deploy smoke test (web ingest path)

After a prod deploy, confirm the same-origin `/ingest` proxy + baked key work
end-to-end **without** the PostHog dashboard or a personal API key — just the
public `phc_…` project key, which already ships in each web bundle.

1. **Reachability** — each web `/ingest` rewrite is deployed and reaches PostHog:
   ```bash
   for h in teka.cd seller.teka.cd admin.teka.cd; do
     curl -s -o /dev/null -w "$h %{http_code}\n" "https://$h/ingest/static/array.js"
   done   # expect: 200 on all three (it proxies posthog-js's array.js)
   ```
2. **Capture** — POST one labeled event through each proxy. Grab the public key
   from the deployed bundle, then send:
   ```bash
   # extract the public phc_ key from the buyer-web bundle
   KEY=$(curl -s https://teka.cd/ | grep -oE '/_next/static/[^"]+\.js' | sort -u \
     | while read c; do curl -s "https://teka.cd$c" | grep -oE 'phc_[A-Za-z0-9]{30,}'; done | head -1)

   for h in teka.cd seller.teka.cd admin.teka.cd; do
     curl -s -w " $h %{http_code}\n" -X POST "https://$h/ingest/i/v0/e/" \
       -H 'Content-Type: application/json' \
       -d "{\"api_key\":\"$KEY\",\"event\":\"deploy_smoke_test\",\"distinct_id\":\"claude-verify\",\"properties\":{\"environment\":\"production\",\"source\":\"smoke-test\",\"surface\":\"$h\"}}"
   done   # expect: {"status":"Ok"} 200 on all three
   ```
3. **Confirm** — PostHog → **Activity → Live Events**, filter
   `distinct_id = claude-verify` (or `event = deploy_smoke_test`). All three
   should appear within seconds, tagged `environment = production`.

Notes:
- This verifies the **web** ingest chain (key baked → proxy → project). It does
  **not** exercise app-generated events — load `teka.cd` for a real `$pageview`,
  or perform a login/checkout for server events.
- **Mobile** can't be smoke-tested this way; `posthog_flutter` only sends once a
  prod build carrying the flavor key is installed.
- These are synthetic, `environment: production`-tagged events — exclude
  `event = deploy_smoke_test` / `distinct_id = claude-verify` from insights, or
  ignore them.

## Adding a new event

1. **Decide the owner** (server vs client) using the ownership rule above — never
   both. Transactional/authoritative → server; UI-intent → client.
2. **Server:** inject `PostHogService` (it's `@Global`) and call
   `this.analytics.capture(user.id, 'event_name', { … })` **after** the action
   succeeds — fire-and-forget, never `await` in the hot path. Add a spec.
3. **buyer-web:** add the event to the `BuyerAnalyticsEvents` map in
   `src/lib/analytics.ts`, then call `track('event_name', { … })` at the UI site.
4. **mobile:** add a method to `PosthogAnalytics` using `Posthog().capture(...)`;
   route any free-text properties through a scrub helper first.
5. Keep property names snake_case, money in CDF centimes as numbers, and **never
   add phone/email/PII**.

## URL migration impact (city-first refactor, 2026-06-06)

The buyer-web URL scheme changed to **city-first** (`/{ville}/{slug}-{shortCode}`,
`/{ville}/categorie/{slug}`) and the English storefront routes were renamed to
French (`/cart→/panier`, `/checkout→/paiement`, `/orders→/commandes`,
`/wishlist→/favoris`). **No analytics code changed** — but URL-keyed dashboards
need a one-time refresh:

- **PostHog (web):** `$pageview` is keyed on `$current_url` (autocapture, manual
  `capture_pageview`). Any saved insight / funnel / cohort that filters on an
  **exact pathname** must be updated:
  - product pages: `/{slug}` → `/{ville}/{slug}-{shortCode}` (filter on
    `pathname` *contains* the city, or use the `product_viewed` custom event
    which is keyed on `productId` and is unaffected).
  - `pathname = '/categorie/…'` → also matches `/{ville}/categorie/…`; tighten
    or loosen as needed.
  - private routes: `/cart`,`/checkout`,`/orders`,`/wishlist` →
    `/panier`,`/paiement`,`/commandes`,`/favoris`.
  - **Custom events are unaffected** — they key on `productId`/`categoryId`, not
    the URL (see Event ownership). Prefer them for durable dashboards.
- **Microsoft Clarity (web):** heatmaps/recordings are grouped by URL, so the new
  paths appear as **new page groups**; historical data stays under the old URLs.
  No action beyond expecting the split (see `docs/clarity.md`).
- **Sentry:** `tracesSampleRate: 0` (errors only, route-agnostic) — **no impact**.
  Old breadcrumbs may reference old paths; new errors use the new paths.
- **Mobile (PostHog `$screen` + Sentry):** **no impact.** go_router routes are
  ID-based and French already; the apps build **no web URLs** and have **no
  `teka.cd` deep-link intent-filters**, so the web URL change can't reach them.

## Deferred / not implemented

- ~~buyer-mobile ecommerce events beyond wishlist~~ — **DONE 2026-06-07** (mobile
  parity sweep P3): buyer-mobile now fires `product_viewed`, `category_viewed`,
  `search_performed`, `add_to_cart`, `remove_from_cart`, `checkout_started` (ids/
  counts only; `search_performed.query` routed through `scrubAnalyticsText`).
  Full client-event parity with buyer-web.
- Server-side feature-flag bootstrapping (`posthog-node`) to remove first-paint
  flag flicker.
- Linking PostHog session replays to Sentry errors.
- Cookie-consent gating (analytics are on by default; acceptable for DRC scope).
