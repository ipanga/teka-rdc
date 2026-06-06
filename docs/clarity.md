# Microsoft Clarity (buyer-web + seller-web)

[Microsoft Clarity](https://clarity.microsoft.com) provides session recordings
and heatmaps. It is wired into **`apps/buyer-web`** and **`apps/seller-web`**
only — **not** `admin-web`, `api`, or the Flutter apps.

It runs alongside the existing analytics with no conflict: Clarity only touches
`window.clarity`, while PostHog uses `window.posthog` and Sentry its own SDK.

## How it loads

A small component renders the official Clarity tag via `next/script`
(`strategy="afterInteractive"` — the App Router best practice for third-party
scripts, and easy on slow connections since it loads after hydration):

- `apps/buyer-web/src/components/analytics/clarity.tsx`
- `apps/seller-web/src/components/analytics/clarity.tsx`

Each is mounted once in the app's `src/app/layout.tsx`. The component renders
**nothing** unless **both** are true:

1. `process.env.NODE_ENV === 'production'` — so `next dev` never loads Clarity.
2. The per-app project-id env var is set — empty → no-op (same gate as Sentry/PostHog).

## Configuration

Per-app project id (public; baked into the browser bundle at build time):

| App | Env var |
|---|---|
| buyer-web | `NEXT_PUBLIC_CLARITY_PROJECT_ID_BUYER_WEB` |
| seller-web | `NEXT_PUBLIC_CLARITY_PROJECT_ID_SELLER_WEB` |

Get each id from **clarity.microsoft.com → (project) → Settings → Overview**
(the value in the install snippet, e.g. `abcde12345`). Use a **separate Clarity
project per app** so buyer and seller sessions don't mix.

`NEXT_PUBLIC_*` is **compile-time only** — the id must be present at *build* time,
not runtime.

### Where it lives per environment

| Environment | Source |
|---|---|
| **Local dev** | Root `.env.development` — left empty; Clarity is gated on `NODE_ENV=production` so it won't load under `next dev` regardless. |
| **Production** | GitHub Secrets `NEXT_PUBLIC_CLARITY_PROJECT_ID_BUYER_WEB` / `NEXT_PUBLIC_CLARITY_PROJECT_ID_SELLER_WEB` → passed as Docker build-args in `.github/workflows/deploy.yml` → `ARG`/`ENV` in each app's `Dockerfile`. **Not** a runtime/compose var (same handling as the PostHog key and the client Sentry DSNs). |

## Deployment requirements

Before a prod deploy can collect Clarity data:

1. Create two Clarity projects (one for buyer-web, one for seller-web).
2. Add the two GitHub repo Secrets above with the respective project ids.
3. Deploy (merge to `main`). The deploy workflow bakes each id into its image;
   `docker-build-check` already validates the Dockerfiles build with the new ARGs.

No nginx, compose, or runtime env change is needed — the ids are compile-time.

## Privacy

Per Rule 10 / Rule 15 (never expose phone numbers), set the recording **masking
mode to "Mask" or "Balanced"** in each Clarity project's settings
(Settings → Project setup → Masking). The install snippet carries no masking
config — masking is enforced server-side by Clarity based on the project setting.

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
   beacons). In the **Console**, `window.clarity` should be a function.
   Building **without** the id (or running `next dev`) → no `clarity.ms` request.

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
apps/buyer-web/Dockerfile                              # NEXT_PUBLIC_CLARITY_PROJECT_ID_BUYER_WEB ARG/ENV
apps/seller-web/src/components/analytics/clarity.tsx   # tag loader
apps/seller-web/src/app/layout.tsx                     # mounts <Clarity/>
apps/seller-web/Dockerfile                             # NEXT_PUBLIC_CLARITY_PROJECT_ID_SELLER_WEB ARG/ENV
.github/workflows/deploy.yml                           # build-args from GitHub Secrets
.env.{example,development,production}                  # env documentation
```
