# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Teka RDC (teka.cd)

## Project Identity

**Platform:** Teka RDC — A full-featured online e-commerce marketplace for the Democratic Republic of Congo, modeled after Jumia (jumia.cd / jumia.com).
**Domain:** teka.cd
**Language:** French.
**Launch Markets:** Haut-Katanga and Lualaba provinces — specifically Lubumbashi, Likasi, and Kolwezi. Architecture must support future expansion to other provinces and towns without structural refactoring.

**Status (May 2026):** Feature-complete. All 8 phases of the original spec (auth → optimization) have shipped. Day-to-day work is now maintenance, refactors, and incremental features — not greenfield phase work. The "Implementation Phases" section below is preserved as historical context, not as a backlog.

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

### Docker

```bash
docker compose up               # 5 services: api, buyer-web, seller-web, admin-web, nginx
docker compose -f docker-compose.prod.yml up    # production stack (cloud DB, SSL via nginx.prod.conf)
```

Note: there is **no local Postgres or Redis container** — the DB is cloud-hosted (Neon/Supabase/Railway) via `DATABASE_URL`. Redis was removed in March 2026; the OTP tables that briefly replaced it were themselves removed in May 2026 when phone-OTP auth was deleted.

### Flutter (mobile)

```bash
cd apps/buyer-mobile && flutter run         # buyer app on connected device/emulator
cd apps/seller-mobile && flutter run        # seller app
flutter test                                 # unit tests
flutter pub run build_runner build           # regenerate Riverpod / freezed code
```

### Branching (see CONTRIBUTING.md for full detail)

Two-branch GitHub Flow: `develop` is the active working branch, `main` is release-only and updated **only** via `gh pr merge --merge` (never `--squash` — squashes cause permanent SHA divergence and phantom conflicts on later back-merges). A pre-push hook at `.githooks/pre-push` blocks direct pushes to `main`. After a hotfix lands on `main`, immediately back-merge `main → develop` to close the loop.

---

## 1. CONTEXT & CONSTRAINTS (DR Congo Realities)

Before making ANY architectural or UX decision, internalize these constraints:

- **Unreliable internet:** Most users are on 2G/3G with frequent drops. Pages must be lightweight (<200KB initial payload ideally), images lazy-loaded and aggressively compressed, and API responses paginated and minimal. Consider offline-first patterns for the mobile app (queue actions, sync when online).
- **Low-end devices:** Target Android 8+ devices with 2GB RAM. Avoid heavy JS bundles on web. Flutter apps must be optimized for low memory.
- **Mobile Money is king:** Cash on delivery and Mobile Money (M-Pesa Vodacom, Airtel Money, Orange Money) are the primary payment methods. Card payments are nearly non-existent for the target market. Integrate a Mobile Money aggregation gateway (e.g., Flexpay, MaxiCash, or direct USSD integration). Structure the payment module to easily add new providers.
- **French.** All UI strings, seed data, error messages, and email/SMS templates are French. DB stores translatable fields as plain TEXT. Web strings live in `apps/*/messages/fr.json`; Flutter strings in `apps/*/lib/l10n/app_fr.arb`.
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
| Cache & Queues | **Removed (Mar 2026)** | Redis was removed. API-level throttling via `@nestjs/throttler` (in-memory). The OTP storage tables that briefly replaced Redis were themselves removed in May 2026 when phone-OTP auth was deleted. |
| Auth | JWT (access) + Refresh Tokens, email/password (all roles) | See Rule 12. Phone-OTP auth + OTP infrastructure removed in May 2026; Google OAuth removed April 2026. |
| Media Storage | Cloudinary | Image upload, transformation, CDN delivery. Max 5MB, auto-compress to WebP. |
| Email Service | Resend.com | Transactional emails — French templates in `apps/api/src/email/templates/`. |
| SMS | Provider abstraction (see Rule 11) | Notification-only (orders, payments, broadcasts). Orange DRC default in prod (OAuth2 client_credentials), Africa's Talking rollback, Mock for dev/test. Selected by `SMS_PROVIDER` env. |
| Payments | Mobile Money (M-Pesa, Airtel Money, Orange Money) + COD | Flexpay aggregator. `PaymentProvider` interface at `apps/api/src/payments/interfaces/`; factory selects mock vs. real via `PAYMENT_MOCK_MODE`. |
| Reverse Proxy | NGINX | SSL termination, routing to services, rate limiting, gzip. Dev: `nginx/nginx.conf`. Prod: `nginx/nginx.prod.conf`. |
| Containerization | Docker + Docker Compose | 5 services in dev (api, buyer-web, seller-web, admin-web, nginx). Cloud DB — no local Postgres. |
| CI/CD | GitHub Actions | Lint → Test → Build → Deploy pipeline |
| Monitoring | Prometheus + Grafana | Health checks, API latency, error rates, queue depth |

### Frontend & Production URLs

| App | Stack | Dev port | Prod subdomain |
|---|---|---|---|
| buyer-web | Next.js 15 (App Router) + Tailwind v4 | 5000 (start) / 5001 (dev) | `teka.cd` |
| seller-web | Next.js 15 (App Router) + Tailwind v4 | 5100 | `seller.teka.cd` |
| admin-web | Next.js 15 (App Router) + Tailwind v4 + Recharts | 5200 | `admin.teka.cd` |
| API | NestJS 11 + Prisma 6 | 5050 | `api.teka.cd` |
| NGINX | Reverse proxy | 8080 | (terminates SSL on each subdomain in prod) |

All three Next.js apps load French strings from `messages/fr.json` via `next-intl`, used purely as a string-resolution library. There is no `[locale]` route segment, no `next-intl` middleware, no language switcher, no `useRouter`/`Link` wrappers — routes live directly under `src/app/` and navigation uses `next/link` + `next/navigation`. `src/i18n/request.ts` returns `{ locale: 'fr', messages: fr.json }` unconditionally.

> **IMPORTANT:** Ports 3000 and 4000 are already in use locally. Never use them.

### Deployment

GitHub Actions handles CI/CD with **zero-downtime** deploys (lint → type-check → test → build → deploy). Every merge to `main` ships. `develop` is the integration branch; releases happen via real merge PRs `develop → main` (see CONTRIBUTING.md — never squash).

### Mobile (Flutter)

| App | Notes |
|---|---|
| buyer-mobile | Consumer-facing app. Primary user interface for most customers |
| seller-mobile | Seller dashboard: manage products, orders, earnings |

Both apps target Android first (APK distribution + Play Store). iOS as future phase.

### Repository Layout

This is a **pnpm workspace** monorepo. The flat `api/`, `buyer-web/`, etc. layout described in earlier drafts of this doc is *not* what's on disk — everything sits under `apps/*` or `packages/*`.

```
teka-rdc/
├── CLAUDE.md                    # This file
├── CONTRIBUTING.md              # Branching, merge policy, pre-push hook setup
├── PROGRESS.md                  # Historical development progress
├── docker-compose.yml           # Dev stack (5 services, no local DB/Redis)
├── docker-compose.prod.yml      # Prod stack (cloud DB, SSL via nginx.prod.conf)
├── .env.development             # Active dev env (root-level, NOT per-app)
├── .env.production              # Active prod env
├── pnpm-workspace.yaml          # packages: apps/*, packages/*
├── tsconfig.base.json           # Root TS config inherited by apps
├── nginx/                       # nginx.conf (dev) + nginx.prod.conf
├── scripts/                     # ruleset-main.json, run-prod-sql.sh
├── tasks/                       # Historical tracker files from past refactors (not an active backlog)
├── apps/
│   ├── api/                     # NestJS 11 backend (port 5050)
│   │   ├── src/                 # Domain modules: auth, users, products, orders, payments,
│   │   │                        # cart, checkout, reviews, wishlist, messaging, broadcasts,
│   │   │                        # banners, promotions, content, settings, reports, sms,
│   │   │                        # email, cloudinary, cities, browse, admin, sellers, ...
│   │   ├── prisma/              # schema.prisma + seed.ts + migrations/
│   │   └── test/                # jest-e2e.json + e2e specs
│   ├── buyer-web/               # Next.js 15 storefront (port 5000, dev 5001) — Tailwind v4
│   ├── seller-web/              # Next.js 15 seller dashboard (port 5100, basePath /seller)
│   ├── admin-web/               # Next.js 15 admin panel (port 5200, basePath /admin) — Recharts
│   ├── buyer-mobile/            # Flutter — Riverpod + go_router + dio
│   │   └── lib/{app.dart, main.dart, core/, features/, l10n/}
│   └── seller-mobile/           # Flutter — same stack
├── packages/
│   └── shared/                  # @teka/shared — types, constants, Zod validators,
│                                # phone normalization (normalizeDrcPhone), auth cookie names
└── docs/
    ├── architecture.md          # Authoritative service architecture (read this first)
    ├── api-reference.md
    ├── deployment.md            # Includes § 5b: how admins are seeded out-of-band
    └── phases/
```

Each Next.js app's `src/` follows the App Router convention (`app/`, `components/`, `lib/`, `middleware.ts`).

---

## 3. ENVIRONMENT CONFIGURATION

`.env.development` (dev) and `.env.production` (prod) live at the **repo root**, not per-app. Every workspace reads from these — the api via `tsx --env-file=../../.env.development`, the Next.js apps via the built-in loader. `.env.example` is the authoritative variable list; keep it in sync when adding new vars.

Key categories (see `.env.example` for the full list with comments):

- **Database** — `DATABASE_URL` (cloud Postgres; no local instance)
- **Auth** — `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRY`, `JWT_REFRESH_EXPIRY`, `COOKIE_DOMAIN` (empty in dev, `.teka.cd` in prod for cross-subdomain cookies)
- **Password hashing & setup links** — `BCRYPT_ROUNDS`, `PASSWORD_RESET_EXPIRY_MINUTES`, `SELLER_SETUP_EXPIRY_HOURS`, `BUYER_SETUP_EXPIRY_HOURS`
- **SMS** — `SMS_PROVIDER` (`orange` | `africas_talking` | `mock`), Orange OAuth (`ORANGE_CLIENT_ID/SECRET/SENDER_ADDRESS/API_BASE`), AT fallback (`AT_API_KEY/USERNAME/SENDER_ID`)
- **Payments** — `FLEXPAY_API_URL`, `FLEXPAY_API_KEY`, `FLEXPAY_MERCHANT_ID`, `FLEXPAY_CALLBACK_URL`, `FLEXPAY_WEBHOOK_SECRET`, `PAYMENT_MOCK_MODE` (toggles mock vs. real provider in the DI factory)
- **Media & email** — `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`
- **Service URLs & CORS** — `API_URL`, `BUYER_WEB_URL`, `SELLER_WEB_URL`, `ADMIN_WEB_URL`, `CORS_ORIGINS`
- **Error monitoring** — `SENTRY_DSN` (empty in dev → `Sentry.init` is skipped and `captureException` is a no-op; set in prod once a Sentry project DSN is provisioned), `SENTRY_RELEASE` (optional, populate with the git short-sha so errors group per-release).

Removed and **not** in use any longer: `REDIS_URL` (Redis dropped Mar 2026), `OTP_EXPIRY_MINUTES` (OTP infrastructure deleted May 2026), `GOOGLE_*_CLIENT_ID` (Google OAuth removed Apr 2026).

---

## 4. CORE FEATURES (Jumia Feature Parity)

Implement ALL of the following, organized by user role. Reference Jumia.cd for exact UX flows.

### 4.1 Buyer Features
- **Registration/Login:** Email + password only (`POST /v1/auth/register/buyer`, `POST /v1/auth/login/email`). No phone-OTP, no Google OAuth. Password reset via email link.
- **Homepage:** Featured products, flash deals, categories, banners (admin-managed)
- **Product Browsing:** Category tree navigation, search with filters (price range, category, location, condition, rating), sort (price, popularity, newest)
- **Product Detail Page:** Image gallery, description, specifications, seller info, ratings/reviews, related products, "Add to Cart" / "Buy Now"
- **Shopping Cart:** Add/remove/update quantities, persist cart (logged in = DB, guest = localStorage synced on login)
- **Checkout Flow:** Address selection/creation (town + neighborhood/avenue, no postal codes), delivery method selection, payment method selection (Mobile Money / COD), order summary, place order
- **Payment:** Mobile Money (USSD push or manual pay flow), Cash on Delivery. Idempotent payment confirmation with webhook handling
- **Order Tracking:** Real-time status (Pending → Confirmed → Shipped → Out for Delivery → Delivered / Cancelled / Returned). SMS notifications at each stage (skipped if user has no phone on file)
- **Reviews & Ratings:** Post-delivery review with 1-5 stars + text. Only verified buyers can review
- **Wishlist / Saved Items**
- **Notifications:** In-app + SMS for order updates, promotions, price drops
- **User Profile:** Edit name, email, phone (for delivery), addresses, password
- **Help/Support:** FAQ, contact form, WhatsApp link

### 4.2 Seller Features
- **Seller Registration:** Email + password (`POST /v1/auth/register/email`) → application form → admin approval. KYC: name, email, phone (for orders/rider contact), ID, business info, location.
- **Seller Dashboard:** Sales overview, revenue stats, pending orders, recent activity
- **Product Management:** CRUD products with: title, description, category, images (up to 8, first = cover), price (CDF and/or USD), stock quantity, condition (new/used), specifications (dynamic by category), delivery options
- **Order Management:** View incoming orders, accept/reject, mark as shipped, print packing slips
- **Earnings & Payouts:** View balance, request payout (to Mobile Money), transaction history
- **Shop Profile:** Public shop page with logo, description, ratings, product listing
- **Promotions:** Create discounts, flash deals (subject to admin approval)
- **Messaging:** Buyer-seller chat for product inquiries
- **Analytics:** Sales trends, top products, conversion metrics

### 4.3 Admin Features
- **Dashboard:** Platform KPIs (GMV, orders, users, sellers, revenue)
- **User Management:** View/search/block buyers and sellers. Role management (super admin, admin, support)
- **Seller Approval:** Review applications, approve/reject with reason
- **Product Moderation:** Review flagged products, approve/reject listings, enforce quality standards
- **Category Management:** CRUD category tree with attributes per category
- **Order Management:** View all orders, intervene in disputes, process refunds
- **Banner/Promotion Management:** Create/schedule homepage banners, platform-wide promotions, flash sales
- **Content Management:** FAQ, help pages, terms & conditions, privacy policy
- **Delivery Zone Management:** Define towns, neighborhoods, delivery fees by zone
- **Payment Management:** View transactions, reconcile Mobile Money callbacks, manage payouts to sellers
- **Commission Settings:** Set platform commission per category or seller
- **Reports:** Sales reports, seller performance, buyer activity, financial reconciliation
- **Notification Broadcast:** Send push/SMS to user segments
- **System Settings:** Site configuration, feature flags, maintenance mode

---

## 5. DATABASE DESIGN PRINCIPLES

- Use UUIDs for all primary keys (avoid sequential IDs for security)
- Implement soft deletes (deletedAt timestamp) for all major entities
- Every table has createdAt, updatedAt timestamps
- Translatable fields are stored as plain TEXT (French) — no JSONB shape, no per-locale columns
- Location hierarchy: Country → Province → Town → Neighborhood (seeded for Haut-Katanga & Lualaba initially)
- Order state machine: Use an enum + transition log table for audit trail
- Monetary values: Store in smallest unit (centimes for CDF) as BigInt to avoid floating point issues. Always store currency code alongside amount
- Indexes: On all foreign keys, frequently filtered columns (status, categoryId, sellerId), and full-text search columns

---

## 6. API DESIGN PRINCIPLES

- RESTful with consistent naming: `GET /api/v1/products`, `POST /api/v1/orders`
- API versioning from day one (`/api/v1/`)
- Standard response envelope: `{ success: boolean, data: T, meta?: { page, limit, total }, error?: { code, message } }`
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

1. **Read `STATUS.md`** at repo root *first*. It is the single source of truth for what is in-flight right now (active initiative, open PRs, next candidates). Updated in the same commit that starts or ends an initiative — so it should never drift. If `## Active initiative` says "None," there is no in-flight work; don't infer one from stale plan files or memory.
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

## 8. IMPLEMENTATION HISTORY (all shipped)

The platform was built in 8 sequential phases — all complete. Do not treat the phase list as a backlog; treat it as historical scope.

| Phase | Scope | Notable code |
|---|---|---|
| 1 | Scaffolding, Docker, NestJS bootstrap, Prisma, Next.js x3, Flutter x2 | `docker-compose.yml`, `apps/api/src/app.module.ts` |
| 2 | Auth & Users — SMS OTP (later removed, see post-phase entries), JWT + refresh rotation, guards, profiles, addresses, seller reg + admin approval | `apps/api/src/auth/`, `apps/api/src/users/` |
| 3 | Product Catalog — categories, products, browse API, moderation, seed data | `apps/api/src/{products,categories,browse}/` |
| 4 | Cart, Checkout, Orders — state machine, delivery zones, SMS notifications | `apps/api/src/{cart,checkout,orders,delivery-zones,notifications}/` |
| 5 | Payments — Flexpay Mobile Money + COD, webhooks, earnings, payouts, commission | `apps/api/src/{payments,payouts,commission}/` |
| 6 | Reviews, Wishlist, Messaging (polling-based, not WebSocket) | `apps/api/src/{reviews,wishlist,messaging}/` |
| 7 | Admin Ops — dashboard charts, banners, promotions/flash deals, content CMS, settings, SMS broadcasts, CSV reports | `apps/api/src/{banners,promotions,content,settings,broadcasts,reports}/` |
| 8 | Production hardening — composite indexes, health probes, throttling, SEO, error boundaries, PWA, Docker prod, 67 e2e tests | `apps/api/src/health/`, `apps/buyer-web/public/sw.js`, `docker-compose.prod.yml` |

Post-phase work (chronological, kept in `PROGRESS.md` + memory):
- **Mar 2026** — Redis removed entirely; 5 Docker containers.
- **Mar 2026** — City marketplace upgrade: `City` + `Commune` models, 8 cities (2 active), city-based product filtering, dynamic per-category attribute forms (web + mobile), commune-based addresses.
- **Apr 2026** — Auth refactor: introduced email + password as the email/password path; SMS provider abstraction (Orange DRC default, Africa's Talking fallback, Mock); seller migration flow scaffolded.
- **Apr 25, 2026** — Google OAuth removed entirely (endpoint deleted, deps removed).
- **Apr 25, 2026** — Category SEO slugs (`/categorie/<slug>` canonical, `/categories/<id>` returns 308 redirect). Sample catalog: "Teka RDC Officiel" platform seller + 152 sample products seeded idempotently.
- **May 2026** — Platform reduced to French only; all multi-locale UI plumbing collapsed and DB translatable fields flattened to plain TEXT.
- **May 14, 2026** — `[locale]` URL routing removed entirely from all 3 Next.js apps. Routes flattened (`app/[locale]/x` → `app/x`). `next-intl` middleware integration + `createNavigation` Link/useRouter wrappers + `i18n/routing.ts` + `i18n/navigation.ts` all deleted. `next-intl` kept solely as a French-only string loader for `messages/fr.json`. Component-level `useTranslations()` calls untouched. Pages that read `useSearchParams()` (login flows: reset-password, setup-password, payment-pending) wrapped in `<Suspense>` to satisfy Next.js 15 prerender rules. `next.config.ts` redirects strip both `/en/*` and `/fr/*` legacy locale prefixes to the un-prefixed path.
- **May 12, 2026** — **Phone-OTP auth removed everywhere.** All roles (buyer, seller, admin) authenticate with email + password. `OtpService` + `OtpModule` + `otps` / `otp_rate_limits` tables deleted. Seller migration redesigned to drop the OTP step. `User.phone` is now `String? @unique` (email-only buyers have `null`). New endpoints: `POST /v1/auth/register/buyer`, `POST /v1/auth/buyer/{migrate-check, migrate-link-email, setup-password}`. Removed (404): `/v1/auth/otp/*`, `/v1/auth/register`, `/v1/auth/login`. `SmsService` is notification-only now (orders, payments, broadcasts).
- **May 15, 2026** — **Buyer auth reverted to WhatsApp OTP (via Gupshup).** Sellers + admins keep email + password. `Otp` + `OtpRateLimit` tables restored (sha256-hashed codes, never plaintext). New `WhatsappModule` + `WhatsappService` + `Gupshup/Mock` providers (separate from `SmsService` — notification SMS stays untouched). New `BuyerOtpService` + `BuyerClaimService`. Endpoints added: `POST /v1/auth/buyer/otp/{request, verify, resend}`, `POST /v1/auth/buyer/claim/{request, verify}`. Endpoints removed (return 404): `POST /v1/auth/register/buyer`, `POST /v1/auth/buyer/{migrate-check, migrate-link-email, setup-password}`. Hard cutover, no feature flag — rollback is `git revert`. Email-only legacy buyers (3-day window 2026-05-12 → 2026-05-15) use the new `/reclamer-compte` claim flow to attach a phone. `BuyerMigration` repurposed for the claim flow (new columns: `tempPhone`, `claimEmailSent`). New env vars at root: `WHATSAPP_PROVIDER`, `GUPSHUP_API_KEY/APP_NAME/SOURCE_NUMBER/BASE_URL/OTP_TEMPLATE_ID`. Production keeps `WHATSAPP_PROVIDER=mock` until the Gupshup template UUID is approved (typically 24–48h after submission).

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

1. **Never hardcode user-facing text.** Externalize to `messages/fr.json` (web) and `app_fr.arb` (Flutter). Strings are French.
2. **Never use ports 3000 or 4000.**
3. **Always keep all platforms in sync.** If a feature is implemented on web, create the corresponding mobile screens (even if simplified). Update PROGRESS.md to track parity.
4. **French only.** No language switcher, no `/en/` URLs, no per-locale columns. All user-facing copy, seed data, error messages, and email/SMS templates are French.
5. **Test before moving on.** No phase is complete without passing tests.
6. **Commit frequently.** After every meaningful sub-task.
7. **Update PROGRESS.md after every completed task.**
8. **Use CDF (Congolese Franc) as primary currency.** Support USD as secondary (many transactions in Katanga use USD informally). Always show both when possible.
9. **Phone number format:** Always store as international format (+243XXXXXXXXX). Display with local formatting. Phone is delivery contact info, not an auth identifier.
10. **For anything not specified:** Optimize for the DRC context (low bandwidth, Mobile Money payments, email-based auth, phone for delivery only). Reference `docs/architecture.md` for the authoritative service architecture.
11. **SMS uses a provider abstraction** at `apps/api/src/sms/interfaces/sms-provider.interface.ts` (mirrors the `PaymentProvider` pattern). Active provider is selected by the `SMS_PROVIDER` env var (`orange` | `africas_talking` | `mock`). To add a new provider, drop an implementation under `apps/api/src/sms/providers/` and wire it in the factory in `sms.module.ts`. **Never call an SMS vendor API directly** from application code — always go through `SmsService`.
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

14. **Two messaging surfaces, two providers.** `SmsService` (Orange / Africa's Talking / Mock — `apps/api/src/sms/`) is **notification-only**: order status updates, payment confirmations, admin broadcasts. `WhatsappService` (Gupshup / Mock — `apps/api/src/whatsapp/`) is **buyer OTP only**. The two modules share nothing — adding a notification SMS template must not touch the WhatsApp module, and changing OTP delivery must not touch SMS. Both pick providers via env (`SMS_PROVIDER`, `WHATSAPP_PROVIDER`) and both refuse to silently mock in production (loud `[ProviderFactory] ERROR` at startup). Notifications skip users with `phone = null`. The OTP code is generated locally with `crypto.randomInt`, stored as `sha256` hex, sent via Gupshup's WhatsApp template-message API.
