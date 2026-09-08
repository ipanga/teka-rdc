# Teka RDC — Deployment Guide

## Prerequisites

- Docker 24+ and Docker Compose v2
- Domain: teka.cd (DNS A record pointing to server IP)
- Cloud PostgreSQL (e.g., Neon, Supabase, Railway, AlwaysData)
- SSL certificate (Let's Encrypt via certbot)
- At least 2GB RAM, 2 vCPU server (Ubuntu 22.04+ recommended)
- pnpm 9+ (for local development only; Docker images handle their own dependencies)

## Architecture Overview

Production runs 5 Docker containers behind NGINX:

| Container | Image | Internal Port | Role |
|-----------|-------|---------------|------|
| nginx | nginx:alpine | 80 / 443 | Reverse proxy, SSL, rate limiting, gzip, security headers |
| api | Custom (Node 20 Alpine) | 5050 | NestJS REST API |
| buyer-web | Custom (Node 20 Alpine) | 5000 | Next.js 15 consumer storefront |
| seller-web | Custom (Node 20 Alpine) | 5100 | Next.js 15 seller dashboard |
| admin-web | Custom (Node 20 Alpine) | 5200 | Next.js 15 admin panel |

PostgreSQL is hosted externally (cloud-managed) and is **not** containerized.

## Quick Start

### 1. Clone and Configure

```bash
git clone https://github.com/your-org/teka-rdc.git
cd teka-rdc
cp .env.production.example .env.production
```

Edit `.env.production` with your actual values. See the [Environment Variables Reference](#environment-variables-reference) section below for all required variables.

**External services to provision before first deploy:**
- **Gupshup WhatsApp (buyer OTP auth)** — Sign up at [gupshup.io](https://www.gupshup.io/), create a WhatsApp Business app, register your sending number, and **submit an authentication template** in French for one-time codes. Template approval typically takes 24–48h (sometimes longer for new accounts). Once approved, copy the template UUID and fill `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_SOURCE_NUMBER`, `GUPSHUP_OTP_TEMPLATE_ID` in `.env.production`, then flip `WHATSAPP_PROVIDER=mock → gupshup` and recreate the api container. **Buyer auth fails closed until this step is complete** — keep `WHATSAPP_PROVIDER=mock` in production (which fails every login attempt with a loud startup warning) only as a deliberate pause; never ship to real users without the approved template.
- **Resend** — Sign up at [resend.com](https://resend.com/), verify your sending domain (`teka.cd`), grab an API key into `RESEND_API_KEY`. Carries all transactional + buyer-fallback + broadcast email.
- **Firebase Cloud Messaging** — Create a Firebase project, add the Android apps (buyer + seller, plus dev/staging flavor variants), download `google-services.json` into each Flutter app, and provision a service-account JSON for the backend. See [push-notifications.md](push-notifications.md) for the full setup.

**Removed services (no longer needed since 2026-05-26):**
- ~~Orange DRC SMS~~ — order events ride Push + Email fallback, broadcasts ride Push + Email. See `OrderNotificationService` and `BroadcastsService`.
- ~~Africa's Talking SMS~~ — same removal.
- ~~Flexpay Mobile Money~~ — platform is COD-only. `CheckoutService` writes `Transaction { provider: COD }` directly.
- **Google Cloud Console** — For the OAuth web client used by the three web apps, add **every** production origin under *Authorized JavaScript origins*:
  - `https://teka.cd`
  - `https://seller.teka.cd`
  - `https://admin.teka.cd`

  For mobile (deferred): create Android clients (one per app, with release SHA-1) and iOS clients (with bundle id). Fill `GOOGLE_IOS_CLIENT_ID` and `GOOGLE_ANDROID_CLIENT_ID` when wiring mobile Google sign-in.
- **Google Search Console / domain verification** — Add `teka.cd` as a property; verify via DNS TXT record (the registrar's CNAME + TXT tab). This unblocks future sitemap submissions and makes the OAuth consent screen eligible for brand verification.

### 2. Generate Secrets

```bash
# Generate JWT secrets (64-char hex strings)
openssl rand -hex 32   # Use for JWT_SECRET
openssl rand -hex 32   # Use for JWT_REFRESH_SECRET
```

### 3. DNS setup (A records)

Point all four public hostnames at the VPS IP **before** requesting Let's Encrypt certificates — certbot fails if DNS hasn't propagated.

| Hostname | Record | Value |
|---|---|---|
| `teka.cd` | A | `<VPS public IPv4>` |
| `www.teka.cd` | A (or CNAME to `teka.cd`) | `<VPS public IPv4>` |
| `api.teka.cd` | A | `<VPS public IPv4>` |
| `seller.teka.cd` | A | `<VPS public IPv4>` |
| `admin.teka.cd` | A | `<VPS public IPv4>` |

Verify propagation with `dig teka.cd +short` / `dig api.teka.cd +short` before moving on.

### 4. SSL Setup (Let's Encrypt)

The production NGINX config (`nginx/nginx.prod.conf`) terminates SSL for **four separate certificates** — one per subdomain. Issue them all in one certbot invocation so the renewal cron covers every host:

```bash
mkdir -p certbot/conf certbot/www

# Port 80 must be free — stop any running nginx first.
docker run -it --rm \
  -v "$PWD/certbot/conf:/etc/letsencrypt" \
  -v "$PWD/certbot/www:/var/www/certbot" \
  -p 80:80 \
  certbot/certbot certonly --standalone \
  --agree-tos --no-eff-email -m ops@teka.cd \
  -d teka.cd -d www.teka.cd \
  -d api.teka.cd \
  -d seller.teka.cd \
  -d admin.teka.cd
```

`nginx.prod.conf` expects certificates at:

- `/etc/letsencrypt/live/teka.cd/{fullchain,privkey}.pem` (covers `teka.cd` and `www.teka.cd`)
- `/etc/letsencrypt/live/api.teka.cd/{fullchain,privkey}.pem`
- `/etc/letsencrypt/live/seller.teka.cd/{fullchain,privkey}.pem`
- `/etc/letsencrypt/live/admin.teka.cd/{fullchain,privkey}.pem`

Renewal cron (host-side, runs every 12h):
```bash
0 */12 * * * docker run --rm -v /srv/teka/certbot/conf:/etc/letsencrypt -v /srv/teka/certbot/www:/var/www/certbot certbot/certbot renew --quiet && docker exec teka-nginx nginx -s reload
```

### 5. Build and Deploy

**Normal operation: you do not run this.** Every deploy is performed by
`.github/workflows/deploy.yml` on a merge to `main` — it builds the four images in CI (baking the
`NEXT_PUBLIC_*` build-args from GitHub Secrets), pushes them to GHCR as `:latest` **and**
`:<git-sha>`, applies the auto-listed migrations, and rolls the containers. See
*Updates and Rollback*. The steps below are the **bootstrap of a brand-new host**, where no image has
been pulled yet.

```bash
# 1. Authenticate to GHCR and pull the images CI already built
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
docker compose --env-file .env.production -f docker-compose.prod.yml pull

# 2. Apply the manual migrations listed in auto-apply.list (§5a).
#    NOTE: there is no `prisma migrate deploy` here — this project has no Prisma
#    migration history (no `prisma/migrations/migration_lock.toml`); production
#    schema changes are idempotent SQL files applied by this script and recorded
#    in the `_manual_migrations` table.
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm --no-deps -T api sh prisma/migrations/apply-auto.sh

# 3. Start all services
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

> Building images **on the VPS** is not supported: `docker-compose.prod.yml` declares no `build:`
> section and the host carries no source tree. If CI is unavailable, build and push from a developer
> machine using the same Dockerfiles and tags.

### 5a. Database migrations (automated during deploy)

Schema-affecting changes ship as **idempotent manual SQL files** under
`apps/api/prisma/migrations/manual/YYYY-MM-DD_*.sql`. There are now **two** ways
they reach production — pick by migration type:

**A. Auto-applied during deploy (expand-phase migrations).** List the filename in
`apps/api/prisma/migrations/manual/auto-apply.list` and it runs automatically on
the next `main` deploy — **no SSH, no manual step**. The deploy workflow
(`.github/workflows/deploy.yml`) runs `prisma/migrations/apply-auto.sh` from a
one-off container built on the freshly-pulled new api image, **after the image
pull but before the rolling container swap** (industry-standard *expand → deploy*).
Each listed file is applied once (recorded in the `_manual_migrations` table) and
is idempotent, so re-deploys skip it and a re-run is harmless. If any migration
fails, the deploy **aborts before the swap** — the old containers keep serving, so
there is no downtime and the new code never runs against a missing column.

> **Only list expand-safe migrations** (additive/backward-compatible + idempotent):
> new nullable columns, new indexes, guarded data updates. The old code must
> tolerate the change, because it keeps serving while the migration runs. This is
> load-bearing: some new columns are read on *every* authenticated request (e.g.
> `jwt.strategy` selects the whole `users` row), and the healthcheck is
> `/health/live` (no DB check), so the schema must exist **before** the new code
> serves — which is exactly what running it pre-swap guarantees.

**B. Manual, point-and-click (destructive or contract-phase migrations).** For
anything that removes a column still read by the running code, or any destructive
change, do **not** put it in the manifest. Apply it by hand at the right moment via
the **Apply prod migration** GitHub Action (`apply-migration.yml`): Actions tab →
Run workflow → paste the filename. It runs the file inside the running api
container over `docker exec` (so the file must already be in the deployed image —
i.e. merged to `main` first).

It runs psql with `ON_ERROR_STOP=1` and, **only after the file succeeds**, records
the filename in the same `_manual_migrations` table the auto-apply path uses
(`ON CONFLICT DO NOTHING`, so the first `applied_at` is kept and re-running an
idempotent migration by hand is harmless). Sharing one table means the two paths
see each other: a migration applied by hand is skipped by a later auto-apply run,
and vice versa. The step reports whether it recorded a first application or
re-ran an already-recorded one.

**The skip is one-directional.** A migration applied by hand is recorded, so a
later auto-apply run skips it (`apply-auto.sh` checks the table first). The
reverse is not true: this workflow has no pre-check and always re-runs the file
it is given, because dispatching it is an explicit operator action and
deliberately replaying an idempotent migration is legitimate. Safety in that
direction comes from the migrations being idempotent, not from a skip.

> **Historical backfill — done 2026-09-02.** Migrations applied by this workflow
> before the tracking write were absent from `_manual_migrations`. They were
> restored by `2026-09-04_backfill_manual_migrations.sql` (run `33679262957`,
> `INSERT 0 26`), which also recorded itself. The table now holds **31** rows:
> 4 auto-applied + 26 historical + 1 self-record. Nine migrations are
> deliberately **not** recorded — eight predate this workflow entirely and
> `2026-06-23_translatable_jsonstring_to_fr.sql` is dev-only — because absence of
> evidence is not evidence of application, and a false "applied" row would make a
> future auto-apply run skip a migration that never ran.

_(There is no Prisma-Migrate path in production: `apps/api/prisma/migrations/`
contains only `manual/*.sql`, `auto-apply.list` and the two shell scripts — no
`migration_lock.toml`, no timestamped Prisma migration folders. Every schema
change reaches production through the manual-SQL + auto-apply flow above or the
« Apply prod migration » workflow. `prisma migrate dev` / `db push` remain
development-only commands.)_

### 5b. Initial production seed (first deploy only)

The seed script understands `SEED_MODE` (`dev` | `prod`). **Always use `prod`** against the production database — `dev` inserts sample buyers, sellers, products, orders, banners and so on, which you do not want anywhere near a live system.

What `SEED_MODE=prod` writes (idempotent — safe to re-run):

- One admin user (identity from env vars, see below)
- 8 cities (Lubumbashi + Kolwezi active, 6 other provinces inactive)
- 8 communes (6 Lubumbashi, 2 Kolwezi)
- Full category tree (old 15 categories deactivated, 8 new main + 47 subcategories activated)
- 72 product attributes with option libraries

What it skips in prod: sample users, addresses, products, delivery zones, orders, reviews, banners, promotions, content pages, broadcasts. Create those through the admin panel once you're up.

Required env vars (fail fast if unset):

| Var | Example | Purpose |
|---|---|---|
| `SEED_ADMIN_PHONE` | `+243XXXXXXXXX` | Admin's phone number. Must be unique. |
| `SEED_ADMIN_EMAIL` | `contact@teka.cd` | Admin's email. First access is via forgot-password on `admin.teka.cd`. |
| `SEED_ADMIN_FIRST_NAME` | `Admin` (default) | Optional. |
| `SEED_ADMIN_LAST_NAME` | `Teka` (default) | Optional. |

The admin is created with `phoneVerified=false` and `emailVerified=false` on purpose — first sign-in goes through `/admin/forgot-password`, which sends a reset link, lets the operator set a password, and marks the email verified atomically.

#### ⚠️ Seeding NEVER overwrites an existing password (regression guard)

The seed **must never clobber a real user's credentials on re-run** — every prod
DB upgrade re-runs `prisma:seed:prod`, so overwriting a password would lock that
user out (the recurring *"Email ou mot de passe invalide"* after deployments).

Root cause history (fixed 2026-06-24): `seedTekaOfficielSeller` adopts the
`TEKA_OFFICIEL_SELLER_EMAIL` account (a **real, owner-managed seller** in prod)
and used to spread fixed dev credentials (`TEKA_OFFICIEL_DEV_PASSWORD`)
unconditionally — so every seed run reset that seller's password to the dev one.
The fix routes all credential writes through `credentialsForSeed(existingHash,
seeded)` (`apps/api/src/common/utils/seed-credentials.util.ts`), which returns
`{}` when the account already has a password — so the seed only ever seeds
credentials onto a **fresh or password-less** account. Unit-tested in
`seed-credentials.util.spec.ts`.

**Recovery (if an account was already clobbered by a pre-fix seed):** deploy the
fix first, then have the user do **one** password reset (or sign in with the dev
password and change it). After the fix is live, the new password persists across
all future seeds. (Auth DTOs already lowercase + trim email, so case is not a
factor.)

```bash
# Seed foundational data against production
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm \
    -e SEED_MODE=prod \
    -e SEED_ADMIN_PHONE='+243XXXXXXXXX' \
    -e SEED_ADMIN_EMAIL='contact@teka.cd' \
  api npx prisma db seed

# Alternative (local workstation with .env.production available):
pnpm --filter api run prisma:seed:prod
```

After the seed completes:
1. Visit `https://admin.teka.cd/forgot-password`
2. Enter `SEED_ADMIN_EMAIL`
3. Check the inbox → set a password → log in


### 6. Verify Deployment

```bash
# Each subdomain responds from the right service
curl -I https://teka.cd
curl -I https://seller.teka.cd
curl -I https://admin.teka.cd

# API health (must be 200)
curl https://api.teka.cd/api/v1/health/live
curl https://api.teka.cd/api/v1/health

# Check readiness (returns 503 if dependencies are down)
curl https://api.teka.cd/api/v1/health/ready

# Check all containers are running
docker compose -f docker-compose.prod.yml ps
```

Expected health response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-28T12:00:00.000Z",
  "service": "teka-rdc-api",
  "checks": {
    "database": "ok"
  },
  "uptime": 123.456
}
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string with pooling params (e.g., `postgresql://user:pass@host:5432/teka_rdc?sslmode=require`) |
| `JWT_SECRET` | Yes | Access token signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Yes | Refresh token signing secret (min 32 chars) |
| `JWT_EXPIRY` | No | Access token expiry (default: `15m`) |
| `JWT_REFRESH_EXPIRY` | No | Refresh token expiry (default: `7d`) |
| `OTP_EXPIRY_MINUTES` | No | OTP validity duration in minutes (default: `5`) |
| `COOKIE_DOMAIN` | Yes (prod) | Cross-subdomain auth cookie scope. **Must be `.teka.cd`** in prod so cookies issued by `api.teka.cd` are visible to `admin.teka.cd` / `seller.teka.cd` / `teka.cd` middleware. Leave empty in dev (cookies stay on localhost). Without this, web middlewares can't see the auth cookie and protected routes always 401-redirect. |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary cloud name for image hosting |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary API secret |
| `WHATSAPP_PROVIDER` | No | Buyer OTP provider: `gupshup` (prod) or `mock` (dev/staging). Selecting `mock` in production emits a loud startup ERROR and fails every buyer OTP delivery. |
| `GUPSHUP_API_KEY` | Yes (if `WHATSAPP_PROVIDER=gupshup` in prod) | Gupshup API key from the Gupshup app dashboard |
| `GUPSHUP_APP_NAME` | No | Gupshup app name (the `src.name` field on the template send) |
| `GUPSHUP_SOURCE_NUMBER` | No | WhatsApp Business sender number (E.164, e.g. `+243XXXXXXXXX`). Gupshup strips the leading `+` automatically. |
| `GUPSHUP_BASE_URL` | No | Gupshup WhatsApp Business API base URL (default: `https://api.gupshup.io/wa/api/v1`). The legacy `/sm/` path returns 401 "Portal User Not Found With APIKey" for accounts on app-level partner tokens (post Feb 2026). |
| `GUPSHUP_OTP_TEMPLATE_ID` | Yes (if `WHATSAPP_PROVIDER=gupshup` in prod) | UUID of the approved authentication template. Template body must contain exactly one parameter (`{{1}}`) for the 6-digit OTP code. |
| `BUYER_SETUP_EXPIRY_HOURS` | No | TTL for the `/reclamer-compte` claim link JWT (default: `24`). |
| `RESEND_API_KEY` | Yes | Resend.com API key for transactional emails (verification, reset, seller setup) |
| `EMAIL_FROM` | No | Sender email address (default: `Teka RDC <noreply@teka.cd>`) |
| `GOOGLE_WEB_CLIENT_ID` | Yes | Google OAuth 2.0 Client ID — Web app (from Google Cloud Console) |
| `GOOGLE_IOS_CLIENT_ID` | No | Google OAuth iOS client id (required for seller-mobile/buyer-mobile on iOS) |
| `GOOGLE_ANDROID_CLIENT_ID` | No | Google OAuth Android client id (required for seller-mobile/buyer-mobile on Android) |
| `BCRYPT_ROUNDS` | No | bcrypt cost factor for password hashing (default: `12`) |
| `PASSWORD_RESET_EXPIRY_MINUTES` | No | TTL for password-reset tokens (default: `60`) |
| `SELLER_SETUP_EXPIRY_HOURS` | No | TTL for seller migration setup-password tokens (default: `24`) |
| `BUYER_WEB_URL` | No | Public URL used to build reset/verification links for buyers |
| `SELLER_WEB_URL` | No | Public URL used to build seller setup/reset links |
| `ADMIN_WEB_URL` | No | Public URL used to build admin reset links |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins (e.g., `https://teka.cd,https://www.teka.cd`) |
| `NODE_ENV` | No | Set automatically to `production` in Docker |
| `API_PORT` | No | API server port (default: `5050`) |
| `API_URL` | No | Full API URL for inter-service communication |
| `DEFAULT_LOCALE` | No | Default language locale (default: `fr`) |
| `SUPPORTED_LOCALES` | No | Comma-separated locales (default: `fr,en`) |
| `DEFAULT_CURRENCY` | No | Default currency code (default: `CDF`) |

## Docker Compose Production Configuration

The `docker-compose.prod.yml` defines all services with:

- **Memory limits**: API (512MB), web apps (256MB each)
- **Health checks**: All services have Docker health checks configured
- **Restart policy**: `unless-stopped` for all services
- **Log rotation**: JSON file driver with 10MB max size, 3 files retained
- **Networks**: `frontend` (NGINX + all web apps + API) and `backend` (API + Redis)

Key differences from development (`docker-compose.yml`):
- No ports are exposed directly (only NGINX exposes 80 and 443)
- SSL termination at NGINX
- Production NGINX config with security headers and HSTS

## NGINX Configuration

The production NGINX (`nginx/nginx.prod.conf`) provides:

### SSL/TLS
- TLSv1.2 and TLSv1.3 only
- Modern cipher suite
- SSL session caching (10m shared cache)
- HTTP to HTTPS redirect

### Security Headers
- nginx emits **only** `Strict-Transport-Security: max-age=63072000; includeSubDomains` (no `preload` —
  the domain is not submitted to the browser preload list; every `teka.cd` host nginx serves is HTTPS-only,
  port 80 redirects). Do not add `preload` without a separate decision.
- CSP, `X-Frame-Options`, nosniff, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP and cache policy are
  emitted by each Next.js app and by helmet in the API (D4, 2026-09-06) — see `docs/architecture.md`
  → *Security Headers*. nginx `location` blocks must stay free of `add_header` so HSTS is inherited.
- Cloudflare sits in front of nginx: the real client IP is restored from `CF-Connecting-IP`
  (`set_real_ip_from`, D8). **Recommended, not automated:** restrict the origin's port 443 to Cloudflare's
  published ranges (VPS firewall) or enable Authenticated Origin Pulls, so direct-to-origin traffic cannot
  bypass the edge; and keep Cloudflare's SSL/TLS mode at *Full (strict)* (the origin holds a valid
  Let's Encrypt certificate).

### Rate Limiting
- **General API**: 30 requests/second per IP (burst 20)
- **Auth endpoints**: 5 requests/second per IP (burst 5)

### Routing
| Path | Upstream | Description |
|------|----------|-------------|
| `/api/v1/auth/*` | api:5050 | Auth endpoints (strict rate limit) |
| `/api/*` | api:5050 | All API endpoints |
| `/admin/*` | admin-web:5200 | Admin panel |
| `/seller/*` | seller-web:5100 | Seller dashboard |
| `/*` | buyer-web:5000 | Buyer storefront (catch-all) |

### Caching
- `/_next/static/*` files: 1-year cache, `immutable`
- Image files (jpg, png, webp, etc.): 1-day cache

### Compression
- gzip level 6
- Types: text/plain, text/css, application/json, application/javascript, text/xml, image/svg+xml

## Monitoring

### Health Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `GET /api/v1/health` | Full health check | 200 with database status |
| `GET /api/v1/health/ready` | Readiness probe | 200 if database OK, 503 if down |
| `GET /api/v1/health/live` | Liveness probe | Always 200 (process alive) |

Health endpoints are exempt from rate limiting (via `@SkipThrottle()`).

### Viewing Logs

```bash
# Follow all service logs
docker compose -f docker-compose.prod.yml logs -f

# Follow specific service
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f nginx

# Recent logs (last 100 lines)
docker compose -f docker-compose.prod.yml logs --tail=100 api

# Filter by time
docker compose -f docker-compose.prod.yml logs --since="2026-02-28T00:00:00" api
```

### Container Status

```bash
# Status of all services
docker compose -f docker-compose.prod.yml ps

# Resource usage
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
```

## Backup Strategy

### Database

Cloud PostgreSQL providers (Neon, Supabase, Railway) offer automated daily backups. For additional manual backups:

```bash
# Manual backup (requires pg_dump installed locally or via Docker)
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql

# Compressed backup
pg_dump "$DATABASE_URL" | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Restore from backup
psql "$DATABASE_URL" < backup_20260228_120000.sql
```

### Media (Cloudinary)

Product images are stored on Cloudinary's CDN. Cloudinary provides its own backup and redundancy. No separate backup is needed for media assets.

## Updates and Rollback

> **Read this before an incident, not during one.** Everything below is written against the
> deployment that actually exists: images built by GitHub Actions and pushed to GHCR, a **flat**
> `/home/deploy/teka-rdc/` directory on the VPS (**not** a git checkout, no source tree, no
> `build:` section in `docker-compose.prod.yml`), and a rolling swap performed by the
> `docker rollout` CLI plugin. Commands that assume a checkout (`git pull`, `git checkout`) or a
> local build (`docker compose build`) **cannot work on the VPS** and were removed on 2026-09-08.

### What lives where

| Thing | Source of truth | How it reaches production |
|---|---|---|
| Application code | container images | `.github/workflows/deploy.yml` builds and pushes `ghcr.io/ipanga/teka-rdc/{api,buyer-web,seller-web,admin-web}` with **two** tags: `:latest` and `:<full-git-sha>` |
| `docker-compose.prod.yml` | this repository | scp'd to the VPS by the deploy job before the swap |
| `nginx/nginx.prod.conf` | this repository | **operator-managed — NOT synced by the deploy.** Copy it by hand when it changes (see below) |
| `.env.production` | the VPS only | operator-managed; never in git |
| Runtime-only variables (`SENTRY_RELEASE`, `SENTRY_ENVIRONMENT`, `POSTHOG_API_KEY`, `APP_REVIEW_*`) | GitHub Secrets | exported by the deploy job into the shell that runs compose; interpolated by `docker-compose.prod.yml` |
| Schema | `apps/api/prisma/migrations/manual/*.sql` | EXPAND phase of the deploy (§5a), or the *Apply prod migration* workflow |

Because the compose file pins `image: …:latest`, **`:latest` is what a plain `compose up` uses**;
the immutable `:<sha>` tags are what makes a rollback possible.

### Standard deploy (automatic)

Merging to `main` runs `deploy.yml`, which:

1. builds and pushes the four images (`:latest` + `:<sha>`);
2. scps `docker-compose.prod.yml` to `/home/deploy/teka-rdc/`;
3. `docker compose --env-file .env.production -f docker-compose.prod.yml pull`;
4. **EXPAND**: `… run --rm --no-deps -T api sh prisma/migrations/apply-auto.sh` (§5a) — aborts the
   deploy before any swap if a migration fails;
5. rolls `api → buyer-web → seller-web → admin-web` with
   `docker rollout -f docker-compose.prod.yml -t 180 --wait 10 <svc>` (new container beside the old,
   waits for its healthcheck, then removes the old);
6. reloads nginx **only if** `nginx -t` passes (never recreates it — that would drop live connections).

No manual step is needed for an ordinary deploy. Manual steps that a *release* may need are listed in
the release checklist at the end of this document.

### Rollback

Four independent layers. Roll back only the one that is broken.

#### 1. Application rollback (the normal case) — revert on `main`

The cleanest rollback is a forward deploy of known-good code: revert the offending commit(s) on `main`
(`git revert -m 1 <merge-sha>` locally, PR into `main`, merge) and let `deploy.yml` run. This keeps
GHCR `:latest`, the VPS and git in agreement. Use it whenever you can wait ~8–10 minutes for CI +
deploy.

#### 2. Container/image rollback (fast, on the VPS) — pin the previous SHA

When you cannot wait, put the previous image back. Every deploy left an immutable
`:<git-sha>` tag in GHCR, so the target is the SHA of the **previous** successful deploy (GitHub →
Actions → *Deploy to production* → the run before the bad one; the SHA is the run's head commit).

```bash
ssh <deploy-user>@<vps>
cd /home/deploy/teka-rdc

PREV=<previous-full-git-sha>          # 40-char SHA, not the short form
SVC=api                               # api | buyer-web | seller-web | admin-web

# GHCR requires auth even for our own images.
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin

docker pull "ghcr.io/ipanga/teka-rdc/$SVC:$PREV"

# The compose file pins :latest, so pin the rollback explicitly in an override
# file rather than editing the synced compose file (the next deploy overwrites it).
cat > rollback.yml <<YAML
services:
  $SVC:
    image: ghcr.io/ipanga/teka-rdc/$SVC:$PREV
YAML

# Runtime-only variables come from the deploy job's shell, not from
# .env.production (which carries only an empty SENTRY_RELEASE placeholder).
# Re-export them or compose interpolates them empty — Sentry loses the release
# tag and server-side PostHog stops sending.
export SENTRY_RELEASE="$PREV"
export SENTRY_ENVIRONMENT=production
export POSTHOG_API_KEY=<server-side PostHog key>

docker compose --env-file .env.production \
  -f docker-compose.prod.yml -f rollback.yml up -d --no-deps "$SVC"

docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

`up -d --no-deps <svc>` recreates that one container (a few seconds of 502 on that service behind
nginx) and is the same command the deploy job uses on a host with no running container. It is
deliberately preferred here over `docker rollout`, because the workflow's rollout invocation takes a
single `-f` and would therefore ignore the override file.

*Zero-downtime variant*, if the seconds matter more than the caveat: retag locally so `:latest`
resolves to the old image, then use the same command the deploy uses —
`docker tag ghcr.io/ipanga/teka-rdc/$SVC:$PREV ghcr.io/ipanga/teka-rdc/$SVC:latest` followed by
`docker rollout -f docker-compose.prod.yml -t 180 --wait 10 $SVC`. **Caveat:** the retag is local and
temporary — the next `docker compose pull` (i.e. the next deploy) restores the real `:latest`. Treat
it as a bridge until layer 1 lands.

After any image rollback, **finish the loop**: revert on `main` so the next deploy does not
re-introduce the bad image, and delete `rollback.yml` from the VPS once it does.

#### 3. nginx / configuration rollback

`nginx/nginx.prod.conf` and `.env.production` live on the VPS and are **not** restored by a code
rollback. Keep a timestamped copy before every edit:

```bash
cd /home/deploy/teka-rdc
cp nginx/nginx.prod.conf "nginx/nginx.prod.conf.$(date +%Y%m%d-%H%M%S).bak"   # before editing
# …edit or scp the new file…
docker compose --env-file .env.production -f docker-compose.prod.yml exec nginx nginx -t   # MUST pass
docker compose --env-file .env.production -f docker-compose.prod.yml exec nginx nginx -s reload
```

To roll back: copy the `.bak` file over `nginx/nginx.prod.conf`, run `nginx -t`, reload. Never
`up -d nginx` for a config change — a reload keeps live connections, a recreate drops them. If
`nginx -t` fails, nginx keeps running the old config: fix the file, do not restart the container.

`docker-compose.prod.yml` is overwritten from the repository on every deploy, so its rollback is a
git revert on `main` (layer 1) — editing it on the VPS only survives until the next deploy.

#### 4. Database migration rollback

**Usually not needed, and usually the wrong move.** Everything in
`prisma/migrations/manual/auto-apply.list` is required to be *additive and idempotent* (the CI job
`Release Config` enforces this via `check-manifest.sh`): a new table or a nullable column that the
**previous** application version simply never reads. Rolling application code back to the previous
image therefore works with the new schema untouched — that is the point of the expand/contract split.

- Applied files are recorded in the `_manual_migrations` table (`filename`, `applied_at`). Query it to
  see exactly what a deploy applied.
- There is **no** `prisma migrate deploy` in production and no Prisma migration history table; do not
  run one.
- If a schema change genuinely must be undone, write a **new** idempotent SQL file under
  `prisma/migrations/manual/`, do **not** add it to `auto-apply.list` (a revert is usually
  destructive), and apply it through the *Apply prod migration* workflow (Actions → run → paste the
  filename) once the file is on `main`. Then delete the original file's row from `_manual_migrations`
  only if you intend it to run again.
- Data loss cannot be undone by any of this. Restore from the database backup (§Backup Strategy)
  before considering a destructive revert.

### Updating a single service

There is nothing to build on the VPS. To move one service to a specific build:

```bash
cd /home/deploy/teka-rdc
docker compose --env-file .env.production -f docker-compose.prod.yml pull api      # newest :latest
docker rollout -f docker-compose.prod.yml -t 180 --wait 10 api                     # zero-downtime swap
```

For a specific SHA, use the override-file form from rollback layer 2.

## Cloudflare origin firewall — MANUAL PRODUCTION STEP

> **Status: NOT APPLIED. Required before the large-scale release.** Documentation only — nothing in
> this repository applies it.

Today `docker-compose.prod.yml` publishes ports 80 and 443 on the VPS to the whole internet, so a
client that knows the origin IP can skip Cloudflare entirely: no WAF, no edge DDoS protection, and
nginx's per-IP `limit_req` zones see the attacker's own address instead of the shared edge address.
The `set_real_ip_from` block (D8) already prevents a **direct** connection from *spoofing*
`CF-Connecting-IP` (the header is trusted only from Cloudflare ranges), so this is a bypass problem,
not a spoofing problem.

**What must be allowed**

- TCP 443 from Cloudflare's published IPv4 and IPv6 ranges (<https://www.cloudflare.com/ips/>) — the
  same list mirrored in `nginx/nginx.prod.conf` (`set_real_ip_from`, checked 2026-09-06).
- TCP 80 from the same ranges **only if** HTTP-01 certificate renewal runs through Cloudflare; if
  Let's Encrypt validates directly against the origin, 80 must stay open to the world or renewal
  fails (§SSL Certificate Renewal). Verify which one applies before closing 80.
- TCP 22 (SSH) from the operator's addresses and from GitHub Actions. **This is the lock-out risk**:
  `deploy.yml` connects over SSH from a GitHub-hosted runner whose IP is not fixed. Either leave 22
  open to the world (current state, protected by key-only auth), restrict it to a VPN/bastion the
  operator controls, or move deploys to a self-hosted runner. **Do not restrict 22 to a static list
  without first confirming how the deploy job will still reach the box.**
- Loopback and the Docker bridge networks (container-to-container traffic must not be filtered).

**What should be blocked**

- TCP 443 (and 80, subject to the caveat above) from every other source.

**How to avoid locking yourself out**

1. Open a second SSH session and keep it open for the whole procedure.
2. Add the ALLOW rules **before** the DENY rule, in one scripted batch.
3. Use the provider's out-of-band console (VPS web console) as the recovery path, and confirm it works
   *before* applying anything.
4. Prefer the hosting provider's cloud firewall over an on-host firewall: a cloud-firewall mistake is
   reversible from the provider's dashboard without any working connection to the box.
5. Schedule it outside peak hours and keep the rollback command in the clipboard.

**Verification after applying**

```bash
# From anywhere: through Cloudflare must still work
curl -sS -o /dev/null -w '%{http_code}\n' https://teka.cd
curl -sS -o /dev/null -w '%{http_code}\n' https://api.teka.cd/api/v1/health/live

# Direct to the origin must now fail (connection refused/timeout, not a 200)
curl -sS -o /dev/null -w '%{http_code}\n' --resolve teka.cd:443:<ORIGIN_IP> https://teka.cd

# The real client IP still reaches the app (not a Cloudflare address)
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=20 nginx
```

Also confirm in the Cloudflare dashboard that SSL/TLS is **Full (strict)** (the origin holds a valid
Let's Encrypt certificate) and that the four hostnames are proxied (orange cloud), not DNS-only.

**Rollback / recovery**

- Cloud firewall: delete the DENY rule in the provider dashboard (takes effect in seconds).
- On-host `ufw`: `sudo ufw disable` from the provider's console, then re-add rules correctly.
- If the deploy job starts failing at the SSH step after this change, that is the lock-out symptom —
  restore the previous SSH rule first, investigate afterwards.

An alternative or complement is Cloudflare **Authenticated Origin Pulls** (origin requires a
Cloudflare client certificate). It needs an nginx change (`ssl_client_certificate` +
`ssl_verify_client on`) and is therefore a code change, not a pure infrastructure step — out of scope
for this document until decided.

## SSL Certificate Renewal

### Manual Renewal

```bash
docker run --rm \
  -v ./certbot/conf:/etc/letsencrypt \
  -v ./certbot/www:/var/www/certbot \
  certbot/certbot renew

# Restart NGINX to pick up new certificates
docker compose -f docker-compose.prod.yml restart nginx
```

### Automatic Renewal (Crontab)

Add to the server's crontab (`crontab -e`):

```bash
# Renew SSL certificates on the 1st and 15th of each month at 3:00 AM
0 3 1,15 * * cd /path/to/teka-rdc && docker run --rm -v ./certbot/conf:/etc/letsencrypt -v ./certbot/www:/var/www/certbot certbot/certbot renew --quiet && docker compose -f docker-compose.prod.yml restart nginx >> /var/log/certbot-renew.log 2>&1
```

## Scaling Considerations

### Horizontal Scaling (API)

To run multiple API containers behind NGINX:

1. Update `docker-compose.prod.yml` to add replicas:
   ```yaml
   api:
     deploy:
       replicas: 3
   ```

2. NGINX upstream already handles load balancing by default (round-robin).

### Database Connection Pooling

- Use your cloud provider's built-in connection pooler (e.g., Neon's pooler, Supabase's PgBouncer)
- Set `DATABASE_URL` to the pooled connection string
- Recommended pool size: 20-50 connections depending on API replicas

### CDN

- Cloudinary serves as the image CDN (product images, banners)
- Cloudflare is in front of NGINX (CDN/edge, DDoS protection, TLS to the visitor). The origin
  restores the visitor IP from `CF-Connecting-IP`; see *Security Headers* above for the recommended
  origin firewall rule.

### Mobile App Distribution

- Primary: Google Play Store (buyer-mobile and seller-mobile)
- Secondary: Direct APK download from teka.cd/download
- Future: iOS App Store

## Troubleshooting

### Container Won't Start

```bash
# Check logs for the failing container
docker compose -f docker-compose.prod.yml logs api

# Check if ports are in use
ss -tlnp | grep -E '80|443'

# Verify environment file is loaded
docker compose -f docker-compose.prod.yml config
```

### Database Connection Issues

```bash
# Test database connection from API container
docker compose -f docker-compose.prod.yml exec api sh -c 'npx prisma db execute --stdin <<< "SELECT 1"'

# Check if DATABASE_URL is correct
docker compose -f docker-compose.prod.yml exec api sh -c 'echo $DATABASE_URL'
```

### SSL Certificate Issues

```bash
# Check certificate expiry
openssl s_client -connect teka.cd:443 -servername teka.cd 2>/dev/null | openssl x509 -noout -dates

# Check certificate files exist
ls -la certbot/conf/live/teka.cd/
```

### High Memory Usage

```bash
# Check per-container memory usage
docker stats --no-stream

# If API memory is high, check for memory leaks
docker compose -f docker-compose.prod.yml restart api
```

## First-deploy provisioning checklist

One-off, for a brand-new environment (not repeated per release):

- [ ] `.env.production` has every variable in `apps/api/src/config/env.validation.ts` set with real
      credentials (the API refuses to boot otherwise)
- [ ] `NODE_ENV` is `production` (set in the Dockerfiles)
- [ ] SSL certificates installed, HTTPS works on all four hostnames
- [ ] Schema present: the manual migrations in `prisma/migrations/manual/auto-apply.list` have been
      applied once (§5a — the deploy applies them automatically; there is **no**
      `prisma migrate deploy` in production)
- [ ] Foundational seed loaded (locations, taxonomy, initial admin — §5b)
- [ ] Health endpoints return `ok`
- [ ] `CORS_ORIGINS` lists production origins only
- [ ] DNS A records for `teka.cd`, `www`, `api`, `seller`, `admin` point at the origin, proxied through
      Cloudflare (orange cloud), SSL/TLS mode *Full (strict)*
- [ ] Crontab entry for SSL renewal configured
- [ ] Log rotation configured (Docker `json-file` driver, 10 MB × 3)
- [ ] Database backup strategy in place and a restore rehearsed
- [ ] Gupshup WhatsApp template approved and `GUPSHUP_OTP_TEMPLATE_ID` set
- [ ] Firebase service-account credentials provisioned (push)
- [ ] Cloudinary presets and limits configured

## Release checklist — every `develop → main` release

Work through this in order. « Automated » items are gates that must already be green before the
release PR is opened; « Manual » items are human actions around the merge; « Post-deploy » items are
run against production immediately after the deploy job finishes.

### AUTOMATED — must be green on the release head before merging

- [ ] `Lint & Type Check` (workspace `tsc --noEmit`)
- [ ] `API Tests` — Jest unit **and** e2e
- [ ] `Web Tests` — buyer-web, seller-web, admin-web Vitest suites
- [ ] `Web Build (buyer-web|seller-web|admin-web)` — real `next build` ×3
- [ ] `Flutter Tests (buyer-mobile|seller-mobile)`
- [ ] `Flutter Analysis (buyer-mobile|seller-mobile)` (`--no-fatal-infos`: warnings fail, infos pass)
- [ ] `Dependency Audit` — `pnpm audit --prod --audit-level=high` (exceptions in
      `package.json → pnpm.auditConfig.ignoreGhsas`)
- [ ] `Release Config` — migration-manifest guard (`check-manifest.sh`: every auto-apply entry exists,
      is unique, non-destructive, idempotent) **and** the TestFlight tester-group mapping test
- [ ] CodeQL — `Analyze (javascript-typescript)` and `Analyze (actions)`
- [ ] PRs to `main` additionally run `pr-validation.yml` (`docker-build-check` ×4)

> Branch protection is **not enforced** on this repository (private repo on the free plan;
> `scripts/ruleset-main.json` is committed but unapplied), so these are verified by reading the PR's
> checks, not by GitHub blocking the merge. The pre-push hook is the only automatic guard on `main`.

### MANUAL — before and around the merge

- [ ] **Diff review**: `git log --oneline origin/main..origin/develop` and
      `git diff --stat origin/main origin/develop` — know what is shipping
- [ ] **Migrations**: list what the EXPAND phase will apply
      (`git diff --name-only origin/main origin/develop -- apps/api/prisma/migrations/manual`), confirm
      each new file is in `auto-apply.list`, additive and idempotent, and that the *previous*
      application version tolerates the resulting schema (rollback layer 4)
- [ ] **`nginx/nginx.prod.conf` changed?**
      `git diff --stat origin/main origin/develop -- nginx/` — **the deploy does NOT sync this file.**
      If it changed, plan the manual copy + `nginx -t` + reload (rollback layer 3) as part of the
      release window; leaving the old file in place while new app images ship their own headers
      produces *duplicate* CSP / X-Frame-Options headers and leaves per-IP rate limiting keyed on
      Cloudflare edge addresses
- [ ] **Env / secrets**: `git diff origin/main origin/develop -- apps/api/src/config/env.validation.ts`
      — any new variable must exist in the VPS `.env.production` (or as a GitHub Secret for the
      runtime-only ones) **before** the merge
- [ ] **Cloudflare origin firewall** applied — see the MANUAL PRODUCTION STEP section above
      *(status: not applied)*
- [ ] **Rollback readiness**: note the current production SHA (previous *Deploy to production* run) and
      confirm `ghcr.io/ipanga/teka-rdc/api:<that sha>` exists; keep the rollback section open
- [ ] **Backup**: a fresh database backup exists and its age is known
- [ ] **Store metadata** (only when a mobile release rides along): version/build numbers bumped, the
      iOS `CFBundleVersion` is higher than the last TestFlight upload, tester groups mapped
      (`fastlane/testflight_groups_test.rb` covers this), release notes written — see
      `docs/mobile-release.md`. Mobile workflows are `workflow_dispatch` only and never run from a
      `main` merge
- [ ] **Merge** the release PR with a **merge commit** (never squash — squashes cause permanent SHA
      divergence and phantom conflicts on the next back-merge), then confirm `main == develop`

### POST-DEPLOY — immediately after the deploy job succeeds

- [ ] Deploy run green; read its log for `applying auto-apply DB migrations` — the applied/skipped
      counts must match what the manual step above predicted
- [ ] Health: `/api/v1/health/live` 200, `/api/v1/health` 200 with `"database":"ok"`,
      `/api/v1/health/ready` 200
- [ ] `docker compose --env-file .env.production -f docker-compose.prod.yml ps` — all five services up,
      health `healthy`, no restart loop (`docker compose … logs --tail=50 api`)
- [ ] nginx routing: each hostname answers from the right service (smoke matrix below)
- [ ] Sentry: the new release appears (`SENTRY_RELEASE` = deploy SHA) and no new issue spike in the
      first 15 minutes
- [ ] API error rate: `docker compose … logs --since 15m api | grep -c "ERROR"` — compare with the
      pre-deploy baseline
- [ ] Critical buyer flow and critical seller flow walked (smoke matrix below)
- [ ] `PROGRESS.md` / `STATUS.md` release record written (merge SHA, deploy run id, migrations applied,
      what was verified)

## Post-deploy smoke matrix

Minimum set. **Read-only wherever a read-only check is sufficient** — the only steps that write are the
buyer order (one real COD order on a disposable buyer, cancelled afterwards) and, if included, the
seller transition of that same order. Never test-write on a real seller's or buyer's data.

### Infrastructure (run first — everything else depends on it)

| # | Check | Command / action | Expected |
|---|---|---|---|
| I1 | API liveness | `curl -s https://api.teka.cd/api/v1/health/live` | 200 |
| I2 | API + database | `curl -s https://api.teka.cd/api/v1/health` | 200, `"database":"ok"` |
| I3 | API readiness | `curl -s -o /dev/null -w '%{http_code}' https://api.teka.cd/api/v1/health/ready` | 200 (503 = DB down) |
| I4 | nginx routing | `curl -sI https://teka.cd https://seller.teka.cd https://admin.teka.cd` | 200/3xx from the right upstream |
| I5 | Apex redirect | `curl -sI https://www.teka.cd` | 301 → `https://teka.cd` |
| I6 | Auth boundary | `curl -s -o /dev/null -w '%{http_code}' https://api.teka.cd/api/v1/sellers/wallet` | 401 |
| I7 | Public catalogue | `curl -s 'https://api.teka.cd/api/v1/browse/products?limit=1'` and `/api/v1/cities` | 200 with data |
| I8 | Security headers | `curl -sI https://seller.teka.cd \| grep -i 'content-security-policy\|strict-transport\|x-frame'` | one CSP (nonce), one HSTS, `X-Frame-Options: DENY` — **two CSP headers means the VPS nginx config is stale** |
| I9 | Containers | `docker compose --env-file .env.production -f docker-compose.prod.yml ps` | 5 services, healthy |
| I10 | Media | open any product image URL (`res.cloudinary.com`) from a PDP | 200, image renders |
| I11 | Sentry | Sentry → Releases | the deploy SHA present; no new unresolved spike |
| I12 | PostHog | PostHog → Live events | events arriving from web (and `api` server-side) |
| I13 | Clarity | Clarity dashboard (buyer only) | session recorded; masking mode still **Strict** |

### Buyer (buyer-web + buyer-mobile where a build shipped)

| # | Check | Expected |
|---|---|---|
| B1 | Homepage `https://teka.cd` | 200, hero + rails render, no console error |
| B2 | Category navigation | `/{ville}/categorie/{slug}` lists products; breadcrumb correct |
| B3 | Search `/recherche?q=…` | results for a known term; empty state for nonsense |
| B4 | Product detail | title, price in FC, stock, seller block, gallery; `View source` shows the Product JSON-LD |
| B5 | Buyer authentication (WhatsApp OTP) | request OTP on a **disposable** number → message received → verify → signed in. Verify the rate-limit copy appears on a deliberate 4th request |
| B6 | Cart | add / change quantity / remove; totals use the promotional price |
| B7 | Checkout | address step, delivery quote, COD-only payment step, recap shows recipient + phone |
| B8 | Order creation | place one order on the disposable buyer → success screen; then cancel it from the buyer side (or admin) and note it in the release record |
| B9 | Order history | the order appears with the right French status; detail shows the snapshot address |
| B10 | Sitemap / robots | `https://teka.cd/sitemap.xml` 200 and well-formed; `robots.txt` 200 |

### Seller (seller.teka.cd + seller-mobile where a build shipped)

| # | Check | Expected |
|---|---|---|
| S1 | Login | email + password on a disposable/known QA seller → dashboard |
| S2 | Dashboard | counts render, no error rows |
| S3 | Action Center | tasks match reality; a task deep-links to its filtered list |
| S4 | Products | list, filters, one product detail opens (no write needed) |
| S5 | Order workflow | the B8 order appears; if you transition it, use the disposable order only and restore/annotate |
| S6 | Earnings / payouts | balance and history render; **do not** request a payout in production |
| S7 | Verification / profile | status reads correctly, town · commune shown; no write needed |
| S8 | Boundary | signed-out access to `/dashboard` redirects to login; `X-Robots-Tag: noindex` present |

### Admin (admin.teka.cd)

| # | Check | Expected |
|---|---|---|
| A1 | Login | admin credentials → dashboard (SUPPORT/FINANCE currently bounce — known, tracked) |
| A2 | Dashboard | KPIs and charts render |
| A3 | Protected routes | signed-out `/dashboard/*` → login; a seller session cannot reach admin routes (403) |
| A4 | Operational views | sellers list, orders list, products moderation queue, payouts list all load |
| A5 | Document preview | a seller verification document preview loads (signed Cloudinary URL) |

