# Microsoft Clarity (buyer-web only)

[Microsoft Clarity](https://clarity.microsoft.com) provides session recordings
and heatmaps. It is wired into **`apps/buyer-web` only** — **not** `seller-web`
(removed by D4, 2026-09-06), `admin-web`, `api`, or the Flutter apps.

> **D4 (2026-09-06):** session-replay tooling was removed from the seller
> portal, which shows identity, payout and verification (KYC) data — masking
> is a dashboard setting we cannot verify from the repository, so the portal
> now runs no recorder at all (PostHog replay is also disabled there, see
> `docs/analytics.md`). The buyer storefront keeps Clarity: its pages are
> public catalogue pages; the only personal surfaces (profile, orders,
> checkout) are inputs, which the project's masking mode must cover — see
> *Privacy* below, a **required** dashboard check before relying on it.

It runs alongside the existing analytics with no conflict: Clarity only touches
`window.clarity`, while PostHog uses `window.posthog` and Sentry its own SDK.

## How it loads

A small component renders the official Clarity tag via `next/script`
(`strategy="afterInteractive"` — the App Router best practice for third-party
scripts, and easy on slow connections since it loads after hydration):

- `apps/buyer-web/src/components/analytics/clarity.tsx`

It is mounted once in `apps/buyer-web/src/app/layout.tsx` and renders
**nothing** unless **both** are true:

1. `process.env.NODE_ENV === 'production'` — so `next dev` never loads Clarity.
2. `NEXT_PUBLIC_CLARITY_PROJECT_ID_BUYER_WEB` is set — empty → no-op (same gate as Sentry/PostHog).

### Content-Security-Policy

The buyer CSP (`apps/buyer-web/src/lib/security-headers.ts`) grants the Clarity
hosts **only when the project id is baked in**: `https://www.clarity.ms` +
`https://scripts.clarity.ms` in `script-src`, `https://*.clarity.ms` in
`connect-src`. Without the id the policy contains no `clarity.ms` entry at all.
The tag itself is an inline script, which is why the storefront's `script-src`
keeps `'unsafe-inline'` (its SEO pages are prerendered and cannot carry a
per-request nonce — the seller/admin portals use nonces instead).

## Configuration

Public project id, baked into the browser bundle at build time:

| App | Env var |
|---|---|
| buyer-web | `NEXT_PUBLIC_CLARITY_PROJECT_ID_BUYER_WEB` |

Get the id from **clarity.microsoft.com → (project) → Settings → Overview**
(the value in the install snippet, e.g. `abcde12345`).

`NEXT_PUBLIC_*` is **compile-time only** — the id must be present at *build* time,
not runtime.

### Where it lives per environment

| Environment | Source |
|---|---|
| **Local dev** | Root `.env.development` — Clarity is gated on `NODE_ENV=production` so it never loads under `next dev`. |
| **Production** | GitHub Secret `NEXT_PUBLIC_CLARITY_PROJECT_ID_BUYER_WEB` → Docker build-arg in `.github/workflows/deploy.yml` → `ARG`/`ENV` in `apps/buyer-web/Dockerfile`. **Not** a runtime/compose var (same handling as the PostHog key and the client Sentry DSNs). |

The former `NEXT_PUBLIC_CLARITY_PROJECT_ID_SELLER_WEB` secret is no longer read
by anything and can be deleted from the repository secrets.

## Privacy — required dashboard check

Per Rule 10 / Rule 15 (never expose phone numbers), the buyer project's
recording **masking mode must be "Strict"** (Settings → Project setup →
Masking) — or at minimum "Balanced" with the profile, address, checkout and
order pages excluded. The install snippet carries no masking config; masking is
enforced by Clarity from the project setting, so **this cannot be verified from
the repository**. If the setting cannot be confirmed, set
`NEXT_PUBLIC_CLARITY_PROJECT_ID_BUYER_WEB` empty in the deploy secrets — the
tag then never loads and the CSP grants nothing to `clarity.ms`.

## Verifying Clarity is working

Because Clarity only loads in production builds, verify against a prod (or local
prod) build, not `next dev`:

1. **Local prod build check** — build with the id set and confirm the tag is emitted:
   ```bash
   NEXT_PUBLIC_CLARITY_PROJECT_ID_BUYER_WEB=test123 pnpm --filter buyer-web build
   pnpm --filter buyer-web start    # serves the production build on :5000
   ```
   Open the page → DevTools **Network** tab → you should see a request to
   `https://www.clarity.ms/tag/<project-id>` (and follow-up `clarity.ms/collect`
   beacons) and **no CSP violation** in the Console. `window.clarity` should be a
   function. Building **without** the id (or running `next dev`) → no `clarity.ms`
   request.

2. **Clarity dashboard** — after the prod deploy, open the project at
   clarity.microsoft.com. "Recordings" / "Dashboard" populate within a few
   minutes of real traffic (Clarity samples sessions, so allow some lag).

## URL migration note (city-first refactor, 2026-06-06)

Clarity groups heatmaps and recordings **by URL**. The buyer-web move to
city-first paths (`/{ville}/{slug}-{shortCode}`, `/{ville}/categorie/{slug}`)
and the French route renames (`/cart→/panier`, `/checkout→/paiement`,
`/orders→/commandes`, `/wishlist→/favoris`) mean new traffic lands under **new
page groups**; historical heatmaps stay under the old URLs. No code or config
change is needed — just expect the split when comparing pre/post-migration data.

## Key files

```
apps/buyer-web/src/components/analytics/clarity.tsx    # tag loader (prod + id gated)
apps/buyer-web/src/app/layout.tsx                      # mounts <Clarity/>
apps/buyer-web/src/lib/security-headers.ts             # CSP grants clarity.ms only when the id is set
apps/buyer-web/Dockerfile                              # NEXT_PUBLIC_CLARITY_PROJECT_ID_BUYER_WEB ARG/ENV
.github/workflows/deploy.yml                           # build-arg from the GitHub Secret
.env.{development,production}                          # env documentation
```
