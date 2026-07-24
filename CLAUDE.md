# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Teka RDC (teka.cd)

## Project Identity

**Platform:** Teka RDC — A full-featured online e-commerce marketplace for the Democratic Republic of Congo, modeled after Jumia (jumia.cd / jumia.com).
**Domain:** teka.cd
**Language:** French.
**Launch Markets:** Haut-Katanga and Lualaba provinces — specifically Lubumbashi, Likasi, and Kolwezi. Architecture must support future expansion to other provinces and towns without structural refactoring.

**Status (Jun 2026):** Feature-complete across web + mobile. All 8 build phases shipped; day-to-day work is maintenance, refactors, and incremental features — not greenfield phase work. Original feature spec + phase history live in `docs/product-spec.md`; chronological initiative history in `PROGRESS.md`; in-flight work in `STATUS.md`.

---

## 0. COMMANDS (the things you'll actually run)

This is a **pnpm workspace** monorepo (`pnpm-workspace.yaml`: `apps/*`, `packages/*`). Node ≥ 20, pnpm ≥ 9.

> **Env files live at the repo root**, not per-app. `.env.development` is the dev file, `.env.production` is the prod file. All workspaces (api + 3 Next.js apps) read from these.

### Root-level (workspace-aware)

```bash
pnpm install                    # install all workspaces
pnpm dev:api                    # run NestJS API on :5050 (watch mode)
pnpm dev:buyer-web              # run buyer storefront on :5001 (dev) / :5000 (prod)
pnpm dev:seller-web             # run seller dashboard on :5100
pnpm dev:admin-web              # run admin panel on :5200
pnpm dev:web                    # all three Next.js apps in parallel
pnpm build                      # builds @teka/shared first, then all apps
pnpm lint                       # recursive lint across all packages
pnpm type-check                 # recursive tsc --noEmit
pnpm test                       # recursive test (Jest in api/, none elsewhere yet)
pnpm db:push                    # prisma db push (schema sync, no migration file)
pnpm db:migrate                 # prisma migrate dev
pnpm db:seed                    # tsx prisma/seed.ts with .env.development
pnpm db:studio                  # open Prisma Studio
pnpm clean                      # nuke node_modules / dist / .next / .turbo everywhere
```

### Running a single API test

The API uses Jest with `rootDir: "src"` and `testRegex: ".*\\.spec\\.ts$"` (see `apps/api/package.json`). From `apps/api/`:

```bash
pnpm test                                  # all unit specs in src/
pnpm test -- path/to/file.spec.ts          # single file
pnpm test -- -t "should reject phone-only seller"  # filter by test name
pnpm test:watch                            # watch mode
pnpm test:e2e                              # jest --config ./test/jest-e2e.json
pnpm test:cov                              # with coverage
```

### Prisma workflow

The seed script uses `tsx --env-file=../../.env.development` rather than auto-loading. If you run `prisma` commands manually and hit a missing `DATABASE_URL`:

```bash
# From repo root, ad-hoc:
DATABASE_URL=$(grep '^DATABASE_URL=' .env.development | cut -d= -f2-) \
  pnpm --filter api exec prisma db push
```

After editing `apps/api/prisma/schema.prisma`: run `pnpm db:push` (cloud DB, no migration files in dev) then `pnpm --filter api prisma:generate` if your IDE doesn't pick up new types.

For production, schema-affecting changes ship as manual SQL files under `apps/api/prisma/migrations/manual/YYYY-MM-DD_*.sql` (idempotent — wrap in `IF NOT EXISTS`). Apply via the `Apply prod migration` GitHub Action: Actions tab → select the workflow → Run workflow → paste the filename. The workflow handles the docker-exec ceremony and validates the filename before SSHing. The api image bundles `postgresql-client` (added 2026-05-21) so psql works inside the container.

### Docker

```bash
docker compose up               # 5 services: api, buyer-web, seller-web, admin-web, nginx
docker compose -f docker-compose.prod.yml up    # production stack (cloud DB, SSL via nginx.prod.conf)
```

Note: there is **no local Postgres or Redis container** — the DB is cloud-hosted (Neon/Supabase/Railway) via `DATABASE_URL`. Redis was removed in March 2026; the OTP tables that briefly replaced it were themselves removed in May 2026 when phone-OTP auth was deleted.

### Flutter (mobile)

Both apps ship **three Android product flavors** (`development` | `staging` | `production`) so dev/staging/prod builds co-install. `flutter run`/`build` without `--flavor` fails fast with `no matching variant` — always pass `--flavor` + the matching `--dart-define-from-file`. The flavor (incl. API base URL + Sentry DSN) is baked in at compile time via `lib/core/config/flavor.dart`. **Full reference: `docs/mobile-flavors.md`.**

```bash
# Run (from apps/buyer-mobile or apps/seller-mobile):
flutter run --flavor development --dart-define-from-file=flavors/development.json
flutter run --flavor production  --dart-define-from-file=flavors/production.json
flutter test                                 # unit tests (flavor not needed)
flutter pub run build_runner build           # regenerate Riverpod / freezed code
```

Dev/staging APKs need per-flavor `google-services.json` (CI injects from secrets) or they fail at `:processGoogleServices*` — see `docs/mobile-flavors.md`.

**Mobile release CI (manual `workflow_dispatch`, per app buyer/seller/both):** Android = `release-mobile-aab.yml` + `build-mobile-apk.yml`; iOS = `release-mobile-ipa.yml` (signed prod IPA via Fastlane `match` → dSYM→Sentry → `ios-testflight` approval gate → TestFlight) + `build-mobile-ipa.yml`. Load-bearing: both apps share Apple team `YK6Z393A4D`; certs live in the private `teka-ios-certs` match repo; committed pbxproj stays `CODE_SIGN_STYLE=Automatic` (CI flips to Manual ephemerally); each TestFlight upload needs a higher `CFBundleVersion`. **Full runbook + secrets + CI gotchas: `docs/mobile-release.md`.** Root `Gemfile`/`fastlane/` hold the Fastlane setup.

### Branching (see CONTRIBUTING.md for full detail)

Two-branch GitHub Flow: `develop` is the active working branch, `main` is release-only and updated **only** via `gh pr merge --merge` (never `--squash` — squashes cause permanent SHA divergence and phantom conflicts on later back-merges). A pre-push hook at `.githooks/pre-push` blocks direct pushes to `main`. After a hotfix lands on `main`, immediately back-merge `main → develop` to close the loop.

---

## 1. CONTEXT & CONSTRAINTS (DR Congo Realities)

Before making ANY architectural or UX decision, internalize these constraints:

- **Unreliable internet:** Most users are on 2G/3G with frequent drops. Pages must be lightweight (<200KB initial payload ideally), images lazy-loaded and aggressively compressed, and API responses paginated and minimal. Consider offline-first patterns for the mobile app (queue actions, sync when online).
- **Low-end devices:** Target Android 8+ devices with 2GB RAM. Avoid heavy JS bundles on web. Flutter apps must be optimized for low memory.
- **Cash on Delivery only:** The platform is COD-only since 2026-05-26 (Orange/AT/Flexpay removal initiative). Mobile Money via Flexpay was retired — `CheckoutService` writes `Transaction { provider: COD }` synchronously on order creation; `AdminOrdersService.markDelivered()` (Teka ops collects the cash on delivery) flips it to `COMPLETED`. The `PaymentMethod.MOBILE_MONEY` enum value stays on the schema for historical-row display. Re-introducing automated payments would mean adding a new provider abstraction — none currently exists.
- **French.** All UI strings, seed data, error messages, and email templates are French, **written directly as literals — there is no localization layer anywhere.** Both Flutter apps had gen-l10n/`app_fr.arb` removed (buyer-mobile 2026-06-22, seller-mobile 2026-06-23); all three Next.js apps had **next-intl fully removed** (admin-web, seller-web, buyer-web — 2026-06-23). No `messages/fr.json`, no `src/i18n/`, no providers/plugins. DB stores translatable fields as plain TEXT. See Rule 1.
- **Logistics are local:** No national postal system. Delivery is handled by local riders/drivers. Build a simple delivery zone system based on towns/neighborhoods, not postal codes. Support seller self-delivery + platform-managed delivery options.
- **Email is the auth identity; phone is for delivery.** All roles register and log in with email + password (since May 2026). Phone (`+243XXXXXXXXX`) is collected at the address / delivery-contact / seller-profile surfaces only, for order notifications and rider contact. `User.phone` is nullable — email-only buyers have no phone.
- **Power outages:** Users may lose connection mid-transaction. All critical flows (checkout, payment confirmation, order placement) must be idempotent and resumable. Use server-side state machines for order lifecycle.

---

## 2. TECH STACK

### Backend

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js + NestJS | Enterprise-grade, modular, TypeScript-native |
| Database | PostgreSQL | Cloud-hosted (Neon, Supabase, or Railway). Connection string in env files |
| ORM | Prisma | Type-safe queries, migrations, seeding |
| Cache & Queues | **None** (Redis removed Mar 2026) | API throttling via `@nestjs/throttler` (in-memory). |
| Auth | JWT access + refresh; role-specific | Buyers = WhatsApp OTP (Gupshup); sellers/admins = email+password. See **Rule 12**. |
| Media Storage | Cloudinary | Max 5MB, auto-compress to WebP. |
| Email Service | Resend.com | French templates in `apps/api/src/email/templates/`. |
| Push | Firebase Cloud Messaging | Primary order-event + broadcast channel. See **Rule 14** + `docs/push-notifications.md`. |
| Payments | **COD only** | `CheckoutService` writes `Transaction{provider:COD}`; `markDelivered()` → `COMPLETED`. No provider/webhook. `MOBILE_MONEY`/`FLEXPAY` enums kept for historical rows. |
| Reverse Proxy | NGINX | SSL, routing, rate limiting, gzip. `nginx/nginx.conf` (dev) / `nginx.prod.conf`. |
| Containerization | Docker + Docker Compose | 5 dev services (api, 3 web, nginx). Cloud DB — no local Postgres. |
| CI/CD | GitHub Actions | Lint → type-check → test → build → deploy. |
| Monitoring | Prometheus + Grafana; Sentry | Health/latency/errors. Sentry: `docs/sentry.md`. |
| Product analytics | PostHog (6 surfaces) + Clarity (web) | `distinctId=user.id`; identity = id+role only; one authoritative owner per event. Details: `docs/analytics.md` + `docs/clarity.md`. |

### Frontend & Production URLs

| App | Stack | Dev port | Prod subdomain |
|---|---|---|---|
| buyer-web | Next.js 15 (App Router) + Tailwind v4 | 5000 (start) / 5001 (dev) | `teka.cd` |
| seller-web | Next.js 15 (App Router) + Tailwind v4 | 5100 | `seller.teka.cd` |
| admin-web | Next.js 15 (App Router) + Tailwind v4 + Recharts | 5200 | `admin.teka.cd` |
| API | NestJS 11 + Prisma 6 | 5050 | `api.teka.cd` |
| NGINX | Reverse proxy | 8080 | (terminates SSL on each subdomain in prod) |

All three Next.js apps use **plain French string literals** — next-intl was fully removed (admin-web, seller-web, buyer-web). There is no `messages/fr.json`, no `src/i18n/request.ts`, no `NextIntlClientProvider`, no `createNextIntlPlugin` wrapper, no `[locale]` route segment, no middleware locale handling, and no language switcher — routes live directly under `src/app/` and navigation uses `next/link` + `next/navigation`. When adding UI copy, write the French string inline.

> **IMPORTANT:** Ports 3000 and 4000 are already in use locally. Never use them.

### Deployment

GitHub Actions handles CI/CD with **zero-downtime** deploys (lint → type-check → test → build → deploy). Every merge to `main` ships. `develop` is the integration branch; releases happen via real merge PRs `develop → main` (see CONTRIBUTING.md — never squash).

### Mobile (Flutter)

| App | Notes |
|---|---|
| buyer-mobile | Consumer-facing app. Primary user interface for most customers |
| seller-mobile | Seller dashboard: manage products, orders, earnings |

Android is the shipping target for both apps (APK distribution + Play Store). iOS is early/in-progress: **both** buyer-mobile and seller-mobile have a native iOS project scaffold under `apps/{buyer,seller}-mobile/ios/` (Runner workspace + Podfile) **now tracked in git** (the canonical Flutter iOS-project set; `Pods/`, `Flutter/Generated.xcconfig`, and `Runner/GoogleService-Info.plist` stay gitignored), but neither is wired into CI or the Android product flavors yet. Treat iOS as not-yet-released — don't assume parity with the Android flavor/release tooling.

### Repository Layout

**pnpm workspace** monorepo — everything is under `apps/*` or `packages/*` (no flat `api/`, `buyer-web/`):

- `apps/` — `api` (NestJS 11, :5050), `buyer-web` (Next 15, :5001/5000 → teka.cd), `seller-web` (:5100,
  basePath `/seller`), `admin-web` (:5200, basePath `/admin`, Recharts), `buyer-mobile` + `seller-mobile`
  (Flutter — Riverpod + go_router + dio). Each Next app's `src/` is App Router (`app/`, `components/`,
  `lib/`, `middleware.ts`); the api's `src/` is domain modules; `apps/api/prisma/` holds schema + seed +
  migrations.
- `packages/shared` — `@teka/shared`: types, constants, Zod validators, `normalizeDrcPhone`, cookie names.
- Root: `docker-compose{,.prod}.yml`, `.env.{development,production,test}` (root-level, NOT per-app),
  `pnpm-workspace.yaml`, `nginx/`, `scripts/`, `Gemfile` + `fastlane/` (iOS release tooling), `tasks/`
  (gitignored local trackers — not a backlog). Root `package.json` has a `pnpm.overrides` block pinning
  security-patched transitive deps — don't strip it during dependency work.

**`docs/` index** (read `architecture.md` first):
`architecture.md` (authoritative service architecture) · `product-spec.md` (feature spec + 8-phase
history) · `url-and-seo-strategy.md` (city-first URLs/slugs/redirects) · `analytics.md` (PostHog) ·
`clarity.md` (Microsoft Clarity) · `api-reference.md` · `deployment.md` (§5b admin seeding) ·
`mobile-connectivity.md` (Rule 15) · `mobile-flavors.md` · `mobile-release.md` (Android signing + Play
Store; **iOS TestFlight CI/CD** — match signing + dSYM→Sentry + approval gate) ·
`payouts.md` (seller payouts + settlement) · `delivery-fees-and-currency.md` (zone-based delivery fees +
FC display + money convention) · `order-workflow.md` (**Teka-managed** order lifecycle: collection → delivery →
COD cash → 2-day return window → payout; commission/financials + lazy payout eligibility + returns + list
response-shape contract) · `push-notifications.md` (FCM) ·
`session-management.md` (per-surface cookies + token rotation) · `sentry.md` ·
`deep-linking.md` (App Links / Universal Links + DeepLinkParser) ·
`town-architecture-refactor.md` + `town-switcher-ux.md` (data-driven town selection / switcher — see note below) ·
`buyer-web-redesign.md` + `buyer-mobile-redesign.md` (buyer UI/UX polish initiatives) ·
`mobile-guest-and-errors.md` (mobile guest-browsing + error-state UX).

---

## 3. ENVIRONMENT CONFIGURATION

`.env.development` (dev), `.env.production` (prod), and `.env.test` (API tests) live at the **repo root**, not per-app. Every workspace reads from these — the api via `tsx --env-file=../../.env.development`, the Next.js apps via the built-in loader. `.env.example` is the authoritative variable list; keep it in sync when adding new vars.

Key categories (see `.env.example` for the full list with comments):

- **Database** — `DATABASE_URL` (cloud Postgres; no local instance)
- **Auth** — `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRY`, `JWT_REFRESH_EXPIRY`, `COOKIE_DOMAIN` (empty in dev, `.teka.cd` in prod for cross-subdomain cookies). Cookies are **per-surface** since 2026-06-18 — `teka_{admin,seller,buyer}_{access,refresh,session}`, selected via the `X-Teka-Surface` header — so the three sessions stay isolated and logout is session-scoped. Refresh rotates with a 15s grace window (no revoke-all on benign races). Full model: `docs/session-management.md`.
- **Password hashing & setup links** — `BCRYPT_ROUNDS`, `PASSWORD_RESET_EXPIRY_MINUTES`, `SELLER_SETUP_EXPIRY_HOURS`, `BUYER_SETUP_EXPIRY_HOURS`
- **Payments** — no env vars; COD-only since 2026-05-26 (Flexpay removed)
- **Media & email** — `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`
- **Service URLs & CORS** — `API_URL`, `BUYER_WEB_URL`, `SELLER_WEB_URL`, `ADMIN_WEB_URL`, `CORS_ORIGINS`
- **Error monitoring** — `SENTRY_DSN` (empty in dev → init skipped, `captureException` a no-op), `SENTRY_RELEASE` (optional git short-sha for per-release grouping).
- **Push notifications (FCM)** — `PushService` takes either `GOOGLE_APPLICATION_CREDENTIALS` (path to a service-account JSON) **or** the discrete trio `FIREBASE_PROJECT_ID`/`FIREBASE_PRIVATE_KEY`/`FIREBASE_CLIENT_EMAIL` (the trio wins when both are set). No-op when neither is configured. Never commit the JSON. **Full setup: `docs/push-notifications.md`.**
- **WhatsApp OTP (Gupshup)** — `WHATSAPP_PROVIDER` + `GUPSHUP_*` (see Rule 14). Mobile keys are per-flavor.
- **iOS release CI (GitHub Actions *repo* secrets, not env-file vars):** `MATCH_PASSWORD`, `MATCH_GIT_BASIC_AUTH`, per-app `{BUYER,SELLER}_ASC_API_KEY_ID`/`_ASC_API_ISSUER_ID`/`_ASC_API_KEY_P8_B64` (same team `YK6Z393A4D` → buyer==seller), plus Firebase-plist + Sentry secrets. **Full table + runbook: `docs/mobile-release.md`.**

Removed / not in use: `REDIS_URL`, `OTP_EXPIRY_MINUTES`, `GOOGLE_*_CLIENT_ID`, all `ORANGE_*`/`FLEXPAY_*`/SMS vars.

---

## 4. CORE FEATURES (Jumia feature parity)

The platform is **feature-complete** (buyer / seller / admin across web + mobile). The full
role-by-role feature spec is in **`docs/product-spec.md`** (historical reference). For *current*
behaviour the authoritative sources are §10 (Rules) below + `docs/architecture.md` — where the original
spec and current behaviour differ (auth, payments, SMS), **the Rules win.**

**Catalog taxonomy + brands (refactored 2026-06-24).** A **3-level taxonomy** — **Category → Subcategory →
Product Type** (7 categories → 35 subcats → ~145 types) — built by **reusing the self-referential `Category`
tree** (product types are `Category` nodes, `16000000-` UUID range; **no separate ProductType table**); defined
in `apps/api/prisma/taxonomy-data.ts`. **Products link to the leaf (product type)**, with attributes + brands
per type. Brands are a **first-class `Brand` library** (admin `/dashboard/brands`; `Product.brandId`; buyer
`brandIds` facet), **not** a "Marque" attribute; **condition = `NEW`/`USED` enum only**. Seeded ids are
non-RFC4122 → endpoints validate by DB lookup, not `@IsUUID`. Reset tooling: `pnpm db:reset-catalog` (dry-run /
`-- --confirm`) + admin `DELETE /v1/admin/products/:id/hard`. Full model: `docs/architecture.md` → "Marketplace
taxonomy + brands".

**Demo catalog + retirement (P3c).** A seeded "Teka RDC Officiel" demo catalog (`Product.isDemo=true`) keeps
the storefront non-empty pre-merchants and always ranks below real products. Per-category auto-retirement is
gated by two KV settings: `RETIRE_DEMO_CATALOG` (**default `false` — ships dormant; leave it off until real
merchants populate categories**) and `DEMO_RETIRE_THRESHOLD` (default `3`). Full model: `docs/architecture.md`
→ "Demo-catalog retirement (P3c)".

**Per-product discounts (2026-06-23).** Sellers set optional `Product.discountPriceCDF`/`discountPriceUSD`
(always-on, no admin approval) — separate from the admin `Promotion`/flash-deal model. Effective price =
`discountPriceCDF ?? priceCDF` (% derived on display, never stored; `0 < discount < price`); `OrderItem.listUnitPriceCDF`
snapshots the original. On ACTIVE products sellers may edit only price/discount/stock (no re-review). Full
model: `docs/architecture.md` → "Per-product discounts".

**Broadcast notifications (2026-06-23).** Admin → buyers on the user-scoped `UserNotification` feed + FCM.
`/v1/admin/broadcasts` targets all buyers or specific `recipientIds` + optional linked product; send is
**fan-out on write** (opt-outs gate push/email delivery only, never the feed). Buyers read the unified
**`/v1/notifications`** feed (web bell + mobile Notification Center). Full model: `docs/architecture.md` →
"Notifications & broadcasts".

**Universal deep linking (2026-06-23, buyer-mobile).** `https://teka.cd/...` links open buyer-mobile when
installed (Android App Links + iOS Universal Links), else the website — additive, no URL/SEO change. Single
source of truth: `apps/buyer-mobile/lib/core/deep_link/deep_link_parser.dart`, which **mirrors** buyer-web
`lib/urls.ts`. **When adding a deep-linkable route, update both `urls.ts` and `DeepLinkParser` + a test.** Full
model: `docs/deep-linking.md`.

---

## 5. DATABASE DESIGN PRINCIPLES

- Use UUIDs for all primary keys (avoid sequential IDs for security)
- Implement soft deletes (deletedAt timestamp) for all major entities
- Every table has createdAt, updatedAt timestamps
- Translatable fields are stored as plain TEXT (French) — no JSONB shape, no per-locale columns
- Location hierarchy: Country → Province → Town → Neighborhood (seeded for Haut-Katanga & Lualaba initially)
  - **Naming caveat (Town Architecture Refactor, Jun 2026):** the *data layer* still uses **`City`** — `model City`, `cityId`, `User.preferredCityId`, `GET /v1/cities`, `CitiesModule`, Flutter `features/city/`, web `useCityStore`. The *UX/URL/copy layer* renamed it to **"town / ville"** — header town selector, first-visit town modal, town-scoped browsing, `/{ville}` SEO landing pages. So a "town" in the UI maps to a `City` row in the DB; don't expect a `Town` model. Towns are **data-driven** (`City.heroImageUrl`/accent color/slug) — no hardcoded Lubumbashi/Kolwezi switches. Full model: `docs/town-architecture-refactor.md` + `docs/town-switcher-ux.md`.
- Order state machine: Use an enum + transition log table for audit trail
- Monetary values: Store in smallest unit (centimes for CDF) as BigInt to avoid floating point issues. Always store currency code alongside amount
- Indexes: On all foreign keys, frequently filtered columns (status, categoryId, sellerId), and full-text search columns

---

## 6. API DESIGN PRINCIPLES

- RESTful with consistent naming: `GET /api/v1/products`, `POST /api/v1/orders`
- API versioning from day one (`/api/v1/`)
- Standard response envelope (as actually emitted): success → `{ success: true, data: T }`; error → `{ success: false, error: { status, message, errors?: [{ field, message }] } }`. `ResponseInterceptor` wraps any return value lacking a `success` key (so a controller returning `{ data, meta }` passes through with `meta` intact — there is no global meta-hoisting); `HttpExceptionFilter` builds the error shape. Note `error.status` (HTTP code), not `error.code`.
- Pagination: cursor-based for feeds, offset for admin tables
- Rate limiting: Per IP and per user, stricter on auth endpoints (login + password-reset flood protection)
- Input validation: Use class-validator + class-transformer in NestJS, Zod schemas in shared/
- Error codes: Consistent error code enum shared between frontend and backend
- File uploads: Multipart to backend → backend uploads to Cloudinary → returns URL. Never store files locally
- Webhooks: Signed webhook endpoints for payment callbacks, with idempotency keys

---

## 7. DEVELOPMENT WORKFLOW & CONTINUITY SYSTEM

### 7.1 Progress Tracking (CRITICAL)

Maintain a `PROGRESS.md` file at the project root. Update it after completing each task.

### 7.2 Resumption Protocol

When resuming work (after interruption or new session):

1. **Read `STATUS.md`** at repo root *first*. It is the single source of truth for what is in-flight right now (active initiative, open PRs, next candidates). Updated in the same commit that starts or ends an initiative — so it should never drift. If `## Active initiative` says "None," there is no in-flight work; don't infer one from stale plan files or memory. If the active initiative points to a `tasks/*-progress.md` tracker, read it next — that file holds the granular sub-task checklist STATUS.md summarizes.
2. **Read `CLAUDE.md`** (this file) for full project context if `STATUS.md` didn't make the situation clear.
3. **Read `PROGRESS.md`** for the chronological history of completed work.
4. **Check git log** (`git log --oneline -20`) for recent commits.
5. **Run tests** (`pnpm test` in `apps/api`) to verify current state.
6. **Continue from the next uncompleted sub-task** — or, if `STATUS.md` says no active initiative, ask the user what to start.

Plan files in `~/.claude/plans/*.md` are session artifacts that may persist after the plan has shipped. Cross-reference any plan you find against `STATUS.md` and git history before executing it — don't treat the file's existence as evidence the work is pending.

### 7.3 Git Discipline

- Commit after every completed sub-task with descriptive messages
- Format: `feat(module): description` / `fix(module): description` / `chore: description`
- Never commit broken code. Run tests before committing
- Use feature branches for major features: `feature/auth`, `feature/products`, `feature/orders`

### 7.4 Testing Strategy

- **Unit tests:** For all service methods, utility functions, validators
- **Integration tests:** For all API endpoints (use NestJS testing module + test DB)
- **Test before moving on:** Every feature must have passing tests before starting the next task
- **Seed data:** Create a comprehensive seed script (`prisma/seed.ts`) with realistic Congolese data (French names, Lubumbashi addresses, CDF prices)

---

## 8. IMPLEMENTATION HISTORY

Built in 8 sequential phases (all shipped); post-phase work continues as discrete initiatives. The
**8-phase table** is in `docs/product-spec.md`; the **chronological initiative history** is in
**`PROGRESS.md`** ("Post-phase chronology — condensed index"); **in-flight work** is in **`STATUS.md`**.
The load-bearing constraints those initiatives created live as Rules in §10 — read those for what to *do*.

> **Do not append initiative history to this file.** `PROGRESS.md` is the chronological record; logging
> initiatives here re-trips the 40k-char CLAUDE.md performance warning. Record them in `PROGRESS.md`.

---

## 9. DESIGN GUIDELINES

- Follow latest **Google Material Design 3** guidelines for mobile apps
- Web UI: Clean, modern, fast-loading. Reference Jumia's layout but make it feel premium
- **Color palette:** Define brand colors early (suggest warm red or blue for DRC market feel)
- **Typography:** Use system fonts + Google Fonts that support French characters (accents)
- **Responsive:** Mobile-first for buyer-web (most traffic will be mobile browser)
- **Accessibility:** WCAG 2.1 AA minimum. Proper contrast ratios, alt text, keyboard navigation
- **Image placeholders:** Always show skeleton loaders while images load (critical for slow connections)
- **Empty states:** Design meaningful empty states with CTAs (no products? → browse categories)
- **Error states:** User-friendly error messages in French, with retry actions

### Design system (web + mobile)

The brand red is **`#BF0000`** (Rakuten France official, PANTONE 485 C). The tonal scale is `--color-primary-50` … `--color-primary-900` in `apps/buyer-web/src/app/globals.css`; `--color-primary` always points at the 600 step. **Don't introduce new hex literals for the brand color** — use the token (`bg-primary`, `text-primary`, `--color-primary-700` for hover states, etc.).

**Authoritative token sources (keep in sync when adjusting):**
- Web: `apps/buyer-web/src/app/globals.css` — `@theme inline {}` block. Defines color scale, neutrals, status colors, radius (sm/md/lg/xl/2xl/full), shadow (xs/sm/md/lg/xl), typography vars.
- Mobile: `apps/buyer-mobile/lib/core/theme/teka_colors.dart` + `app_theme.dart`.

**Web UI primitives:** `apps/buyer-web/src/components/ui/` — small in-repo set built on Tailwind v4 + `class-variance-authority`. Exports: `Button`, `Badge`, `Card`/`CardHeader`/`CardContent`/`CardFooter`, `Input`, `Label`, `Container`, `SectionHeader`. **No shadcn** — these primitives are intentionally minimal; add new ones only when a pattern repeats ≥3 times. Domain components (`ProductCard`, `CartItemRow`, etc.) live under `components/{product,cart,...}/` and consume these primitives.

---

## 10. IMPORTANT RULES

1. **All user-facing text is French — written directly, not localized.** **Both Flutter apps (buyer-mobile + seller-mobile)** have no localization layer: write French string literals straight in the Dart widgets. The `flutter_localizations`/gen-l10n stack (`app_fr.arb`, generated `AppLocalizations`, `l10n.yaml`) was removed (buyer-mobile 2026-06-22, seller-mobile 2026-06-23) — do **not** add an ARB/l10n key for new strings, and do not re-introduce gen-l10n. **Web:** all three Next.js apps had **next-intl fully removed** (admin-web, seller-web, buyer-web — 2026-06-23) — write French literals inline; do **not** re-introduce `next-intl`, `messages/fr.json`, `src/i18n/`, `NextIntlClientProvider`, or the `createNextIntlPlugin` wrapper. (Framework `GlobalMaterialLocalizations`/`GlobalWidgetsLocalizations` stay pinned to `fr` — that's Flutter rendering built-in widgets, not our layer.)
2. **Never use ports 3000 or 4000.**
3. **Always keep all platforms in sync.** If a feature is implemented on web, create the corresponding mobile screens (even if simplified). Update PROGRESS.md to track parity.
4. **French only.** No language switcher, no `/en/` URLs, no per-locale columns. All user-facing copy, seed data, error messages, and email/SMS templates are French.
5. **Test before moving on.** No phase is complete without passing tests.
6. **Commit frequently.** After every meaningful sub-task.
7. **Update PROGRESS.md after every completed task.**
8. **Use CDF (Congolese Franc) as primary currency.** Support USD as secondary (many transactions in Katanga use USD informally). Always show both when possible.
9. **Phone number format:** Always store as international format (+243XXXXXXXXX). Display with local formatting. Phone is delivery contact info, not an auth identifier.
10. **For anything not specified:** Optimize for the DRC context (low bandwidth, COD payments, email-based auth, phone for delivery only — buyer auth also uses phone via WhatsApp OTP). Reference `docs/architecture.md` for the authoritative service architecture.
11. **SMS is gone (2026-05-26).** The provider abstraction at `apps/api/src/sms/` (Orange DRC, Africa's Talking, mock) was deleted in PR C2 of the Orange/AT/Flexpay removal initiative. Order events ride **Push (FCM) primary + Email (Resend) fallback** via `OrderNotificationService` (PR A2). Admin broadcasts ride **Push + Email** with a per-broadcast `channels` toggle via `BroadcastsService` (PR A3 + C2). Buyer OTP rides **WhatsApp via Gupshup** via `WhatsappService` (see Rule 14). **Do not re-introduce SMS** without a written architecture decision — the removal closed a load-bearing outage gap (operator-stripped env vars + missing Joi tolerance → 2026-05-24 crash loop).
12. **Authentication is role-specific (since 2026-05-15).** Sellers + admins use **email + password**. Buyers use **WhatsApp OTP via Gupshup**. Role mapping:
    - **Buyers** — `POST /v1/auth/buyer/otp/{request, verify, resend}`. The verify endpoint either signs into an existing User matched by phone (any role — see decision below) or creates a new BUYER. Optional `firstName/lastName` captured on first verify. Email-only legacy buyers from the 2026-05-12 → 2026-05-15 cohort use the claim flow `POST /v1/auth/buyer/claim/{request, verify}`: enter email → magic link → enter phone → WhatsApp OTP → phone attached.
    - **Sellers** — self-service register at `POST /v1/auth/register/email` → admin approval. Login at `POST /v1/auth/login/email`. Legacy sellers migrate via `/v1/auth/seller/{migrate-check, migrate-link-email, setup-password}`.
    - **Admins** — seeded out-of-band (see `docs/deployment.md § 5b`). Login at `POST /v1/auth/login/email`. Password bootstrap via `/v1/auth/password-reset/request`.

    **Phone uniqueness is global** (`User.phone @unique`). If a phone is already attached to a seller account, the buyer-side OTP flow signs the user into that seller account. The buyer-web detects `user.role === 'SELLER'` after verify and redirects to `SELLER_WEB_URL`.

    Password reset is sellers + admins only (`/v1/auth/password-reset/{request, confirm}`). Buyers have no password; a password-reset request from a buyer email returns a neutral 200 but creates no token. The 3-day-window email+password buyer cohort uses `/reclamer-compte` instead.

    Removed endpoints (return 404):
    - `/v1/auth/otp/request`, `/v1/auth/otp/verify`, `/v1/auth/register`, `/v1/auth/login`, `/v1/auth/login/google`, `/v1/auth/otp/request-email` (legacy phone-OTP + Google).
    - `/v1/auth/register/buyer`, `/v1/auth/buyer/{migrate-check, migrate-link-email, setup-password}` (legacy email-password buyer + migration, deleted 2026-05-15).

    The `PHONE_OTP`, `EMAIL_PASSWORD`, and `GOOGLE` enum values all stay on `AuthProvider`. Current code paths create `PHONE_OTP` (buyers via OTP) and `EMAIL_PASSWORD` (sellers, admins, plus the 3-day email-buyer cohort whose accounts persist until claim).

13. **Phone is buyer auth identifier AND delivery contact.** For sellers + admins, phone stays delivery-only (collected at the address / seller-profile surfaces). For buyers since 2026-05-15, phone is *also* the auth identifier — set on first WhatsApp OTP verify and required from that point. Users type 9 digits (or 10 with leading `0`); `+243` is added by the system. Single source of truth: `normalizeDrcPhone()` in `packages/shared/src/utils/phone.ts` (web) and `apps/buyer-mobile/lib/core/utils/phone.dart` (Flutter). Backend DTOs that store phone enforce `^\+243\d{9}$`. `User.phone` is `String? @unique` globally; email-only buyers (the 3-day claim cohort) have `null` until they complete `/reclamer-compte`.

14. **Three messaging surfaces, three providers.** Each has a single, narrowly-scoped responsibility:
    - **`PushService`** (`apps/api/src/push/`, Firebase Cloud Messaging) — primary channel for buyer + seller order events and admin broadcasts. Multicast per user (one user can have many active `DeviceToken` rows). Auto-invalidates rejected tokens on send. **No env-driven provider selection** — there's only one push backend.
    - **`EmailService`** (`apps/api/src/email/`, Resend) — fallback for buyer order events when push has 0 active tokens; also transactional email (verification, password reset, seller setup, buyer claim, contact-form forwarding) and admin broadcasts. Dev mode logs to console instead of calling Resend.
    - **`WhatsappService`** (`apps/api/src/whatsapp/`, Gupshup) — **buyer OTP only** (login + register + account claim). Never used for notifications or broadcasts. Provider is selected via `WHATSAPP_PROVIDER` env (`gupshup` | `mock`); the factory refuses to silently mock in production (loud `[GupshupWhatsappProvider] ERROR` at startup). OTP code is generated locally with `crypto.randomInt`, stored as `sha256` hex, sent via Gupshup's WhatsApp template-message API.

    The three stacks never call each other — adding an email template must not touch Push or WhatsApp code, and vice versa. The legacy `SmsService` was deleted 2026-05-26 in PR C2 (see Rule 11).

15. **Mobile connectivity discipline (since 2026-05-27).** Both Flutter apps ship a centralized 5-state connectivity machine (`connected | unstable | noInternet | disconnected | reconnecting`) at `apps/{buyer,seller}-mobile/lib/core/connectivity/` + interceptor stack at `…/core/network/`. **Full reference: `docs/mobile-connectivity.md`** — read it before touching anything below.

    Hard rules when adding or modifying network code in either Flutter app:
    - **Never bypass the Dio chain.** Always go through `apps/{buyer,seller}-mobile/lib/core/network/api_client.dart`. The chain order — `OfflineAware → Auth → Retry → Log` — is load-bearing; retries must flow through auth attach.
    - **Never set `Options(extra: {'retryable': true})` on a non-idempotent call.** The retryable-by-default set is `GET` + `HEAD`. Checkout, OTP request/verify/resend, buyer claim, seller login, seller order transitions, payouts, and product publish/update are explicitly non-retry-safe — replaying them races state.
    - **Never call a SMS / OTP / payment vendor directly from app code.** Those are server concerns; the app talks to `${baseUrl}/v1/…` only.
    - **Always mirror buyer-mobile changes into seller-mobile (and vice versa) in the same PR.** The two trees are kept byte-for-byte identical for the connectivity layer.
    - **Always surface network errors with the shared helper** at `apps/{buyer,seller}-mobile/lib/core/network/dio_error_messages.dart`. No per-feature copies of `_extractErrorMessage(DioException)` — the helper covers timeout / connection-error / API-envelope / fallback in French.
    - **Never log credentials, tokens, phone numbers, or query strings** from the connectivity layer or the Sentry reporter. The existing `core/config/sentry_scrub.dart` `beforeSend` scrubs phones globally; don't undo it.
    - **State mutations are hard-blocked offline** by `OfflineAwareInterceptor`. Do not add a "queue and replay" fallback without an architecture decision — the original design intentionally rejected it (replay races price + stock during the offline window).
