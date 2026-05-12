# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Teka RDC (teka.cd)

## Project Identity

**Platform:** Teka RDC — A full-featured online e-commerce marketplace for the Democratic Republic of Congo, modeled after Jumia (jumia.cd / jumia.com).
**Domain:** teka.cd
**Language:** French (fr) only — monolingual platform since 2026-04-25.
**Launch Markets:** Haut-Katanga and Lualaba provinces — specifically Lubumbashi, Likasi, and Kolwezi. Architecture must support future expansion to other provinces and towns without structural refactoring.

**Status (May 2026):** Feature-complete. All 8 phases of the original spec (auth → optimization) have shipped. Day-to-day work is now maintenance, refactors, and incremental features — not greenfield phase work. The "Implementation Phases" section below is preserved as historical context, not as a backlog.

---

## 0. COMMANDS (the things you'll actually run)

This is a **pnpm workspace** monorepo (`pnpm-workspace.yaml`: `apps/*`, `packages/*`). Node ≥ 20, pnpm ≥ 9.

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

Note: there is **no local Postgres or Redis container** — the DB is cloud-hosted (Neon/Supabase/Railway) via `DATABASE_URL`, and Redis was removed in March 2026 (OTP storage moved to PostgreSQL `otps` + `otp_rate_limits` tables).

### Flutter (mobile)

```bash
cd apps/buyer-mobile && flutter run         # buyer app on connected device/emulator
cd apps/seller-mobile && flutter run        # seller app
flutter test                                 # unit tests
flutter pub run build_runner build           # regenerate Riverpod / freezed code
flutter gen-l10n                             # regenerate from app_fr.arb (FR-only since 2026-04-25)
```

### Branching (see CONTRIBUTING.md for full detail)

Two-branch GitHub Flow: `develop` is the active working branch, `main` is release-only and updated **only** via `gh pr merge --merge` (never `--squash` — squashes cause permanent SHA divergence and phantom conflicts on later back-merges). A pre-push hook at `.githooks/pre-push` blocks direct pushes to `main`. After a hotfix lands on `main`, immediately back-merge `main → develop` to close the loop.

---

## 1. CONTEXT & CONSTRAINTS (DR Congo Realities)

Before making ANY architectural or UX decision, internalize these constraints:

- **Unreliable internet:** Most users are on 2G/3G with frequent drops. Pages must be lightweight (<200KB initial payload ideally), images lazy-loaded and aggressively compressed, and API responses paginated and minimal. Consider offline-first patterns for the mobile app (queue actions, sync when online).
- **Low-end devices:** Target Android 8+ devices with 2GB RAM. Avoid heavy JS bundles on web. Flutter apps must be optimized for low memory.
- **Mobile Money is king:** Cash on delivery and Mobile Money (M-Pesa Vodacom, Airtel Money, Orange Money) are the primary payment methods. Card payments are nearly non-existent for the target market. Integrate a Mobile Money aggregation gateway (e.g., Flexpay, MaxiCash, or direct USSD integration). Structure the payment module to easily add new providers.
- **French-only platform:** Teka RDC is monolingual since 2026-04-25 and was further flattened on 2026-05-04. The DB stores translatable fields as plain TEXT (no `{ fr, en }` JSONB), DTOs accept plain strings, and admin/seller forms have a single language input. Translation *infrastructure* is preserved — next-intl serves `messages/fr.json`, the `[locale]` route directory stays with `localePrefix: 'never'` and `locales: ['fr']`, and `flutter_localizations` is wired against `app_fr.arb`. No language switcher, no `/en/` URLs, no hreflang, no `app_en.arb`. To re-add a locale later: restore EN message file / ARB and flip `routing.ts` `locales` back to `['fr', 'en']`. Re-introducing EN content into the DB would require a new schema (e.g., a `translations` table) — the JSONB shape is gone.
- **Logistics are local:** No national postal system. Delivery is handled by local riders/drivers. Build a simple delivery zone system based on towns/neighborhoods, not postal codes. Support seller self-delivery + platform-managed delivery options.
- **Phone numbers as primary identity:** Most users don't have email. Support phone number (with country code +243) as the primary registration and login method, with email as optional. SMS OTP is the primary verification flow.
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
| Email Service | Resend.com | Transactional emails — French-first templates in `apps/api/src/email/templates/`. |
| SMS/OTP | Provider abstraction (see Rule 11) | Orange DRC is default in prod (OAuth2 client_credentials). Africa's Talking is rollback. Mock for dev/test. Selected by `SMS_PROVIDER` env. |
| Payments | Mobile Money (M-Pesa, Airtel Money, Orange Money) + COD | Flexpay aggregator. `PaymentProvider` interface at `apps/api/src/payments/interfaces/`; factory selects mock vs. real via `PAYMENT_MOCK_MODE`. |
| Reverse Proxy | NGINX | SSL termination, routing to services, rate limiting, gzip. Dev: `nginx/nginx.conf`. Prod: `nginx/nginx.prod.conf`. |
| Containerization | Docker + Docker Compose | 5 services in dev (api, buyer-web, seller-web, admin-web, nginx). Cloud DB — no local Postgres. |
| CI/CD | GitHub Actions | Lint → Test → Build → Deploy pipeline |
| Monitoring | Prometheus + Grafana | Health checks, API latency, error rates, queue depth |

### Frontend & Production URLs

| App | Stack | Dev port | Prod subdomain |
|---|---|---|---|
| buyer-web | Next.js 15 (App Router) + Tailwind v4 + next-intl | 5000 (start) / 5001 (dev) | `teka.cd` |
| seller-web | Next.js 15 (App Router) + Tailwind v4 + next-intl | 5100 | `seller.teka.cd` |
| admin-web | Next.js 15 (App Router) + Tailwind v4 + Recharts | 5200 | `admin.teka.cd` |
| API | NestJS 11 + Prisma 6 | 5050 | `api.teka.cd` |
| NGINX | Reverse proxy | 8080 | (terminates SSL on each subdomain in prod) |

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
├── tasks/                       # In-flight tracker files (e.g. auth-refactor-progress.md)
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

Each Next.js app's `src/` follows the App Router convention (`app/`, `components/`, `lib/`, `i18n/`, `middleware.ts`). The `[locale]` route directory is preserved with `locales: ['fr']` and `localePrefix: 'never'` to keep next-intl plumbing in place for future re-locale work — there is no `/en/` URL.

---

## 3. ENVIRONMENT CONFIGURATION

All `.env` files live at the project root:

```bash
# .env.example (document every variable)

# === Database ===
DATABASE_URL=postgresql://user:pass@host:5432/teka_rdc

# === Redis ===
REDIS_URL=redis://user:pass@host:6379

# === Auth ===
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
OTP_EXPIRY_MINUTES=5

# === Cloudinary ===
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# === Resend (Email) ===
RESEND_API_KEY=
EMAIL_FROM=noreply@teka.cd

# === Africa's Talking (SMS) ===
AT_API_KEY=
AT_USERNAME=
AT_SENDER_ID=TekaRDC

# === Payment (Mobile Money) ===
FLEXPAY_API_KEY=
FLEXPAY_MERCHANT_ID=
FLEXPAY_CALLBACK_URL=

# === App URLs ===
API_URL=http://localhost:5050
BUYER_WEB_URL=http://localhost:5000
SELLER_WEB_URL=http://localhost:5100
ADMIN_WEB_URL=http://localhost:5200

# === Misc ===
NODE_ENV=development
APP_NAME=Teka RDC
DEFAULT_LOCALE=fr
SUPPORTED_LOCALES=fr,en
DEFAULT_CURRENCY=CDF
SUPPORTED_CURRENCIES=CDF,USD
DEFAULT_COUNTRY_CODE=+243
```

---

## 4. CORE FEATURES (Jumia Feature Parity)

Implement ALL of the following, organized by user role. Reference Jumia.cd for exact UX flows.

### 4.1 Buyer Features
- **Registration/Login:** Phone (OTP) primary, email optional, Google OAuth optional
- **Homepage:** Featured products, flash deals, categories, banners (admin-managed)
- **Product Browsing:** Category tree navigation, search with filters (price range, category, location, condition, rating), sort (price, popularity, newest)
- **Product Detail Page:** Image gallery, description, specifications, seller info, ratings/reviews, related products, "Add to Cart" / "Buy Now"
- **Shopping Cart:** Add/remove/update quantities, persist cart (logged in = DB, guest = localStorage synced on login)
- **Checkout Flow:** Address selection/creation (town + neighborhood/avenue, no postal codes), delivery method selection, payment method selection (Mobile Money / COD), order summary, place order
- **Payment:** Mobile Money (USSD push or manual pay flow), Cash on Delivery. Idempotent payment confirmation with webhook handling
- **Order Tracking:** Real-time status (Pending → Confirmed → Shipped → Out for Delivery → Delivered / Cancelled / Returned). SMS notifications at each stage
- **Reviews & Ratings:** Post-delivery review with 1-5 stars + text. Only verified buyers can review
- **Wishlist / Saved Items**
- **Notifications:** In-app + SMS for order updates, promotions, price drops
- **User Profile:** Edit name, phone, email, addresses, language preference
- **Help/Support:** FAQ, contact form, WhatsApp link

### 4.2 Seller Features
- **Seller Registration:** Application form → admin approval. KYC: phone, name, ID, business info, location
- **Seller Dashboard:** Sales overview, revenue stats, pending orders, recent activity
- **Product Management:** CRUD products with: title (fr + en), description (fr + en), category, images (up to 8, first = cover), price (CDF and/or USD), stock quantity, condition (new/used), specifications (dynamic by category), delivery options
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
- **Content Management:** FAQ, help pages, terms & conditions, privacy policy (French)
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
- Multi-language fields: Use JSON columns for translatable text `{ "fr": "...", "en": "..." }`
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
- Rate limiting: Per IP and per user, stricter on auth endpoints (OTP flood protection)
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

1. **Read `CLAUDE.md`** (this file) for full project context
2. **Read `PROGRESS.md`** to know exactly where you stopped
3. **Check git log** (`git log --oneline -20`) for recent commits
4. **Run tests** (`npm test` in api/) to verify current state
5. **Continue from the next uncompleted sub-task**

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
| 2 | Auth & Users — SMS OTP, JWT + refresh rotation, guards, profiles, addresses, seller reg + admin approval | `apps/api/src/auth/`, `apps/api/src/users/` |
| 3 | Product Catalog — categories, products, browse API, moderation, seed data | `apps/api/src/{products,categories,browse}/` |
| 4 | Cart, Checkout, Orders — state machine, delivery zones, SMS notifications | `apps/api/src/{cart,checkout,orders,delivery-zones,notifications}/` |
| 5 | Payments — Flexpay Mobile Money + COD, webhooks, earnings, payouts, commission | `apps/api/src/{payments,payouts,commission}/` |
| 6 | Reviews, Wishlist, Messaging (polling-based, not WebSocket) | `apps/api/src/{reviews,wishlist,messaging}/` |
| 7 | Admin Ops — dashboard charts, banners, promotions/flash deals, content CMS, settings, SMS broadcasts, CSV reports | `apps/api/src/{banners,promotions,content,settings,broadcasts,reports}/` |
| 8 | Production hardening — composite indexes, health probes, throttling, SEO, error boundaries, PWA, Docker prod, 67 e2e tests | `apps/api/src/health/`, `apps/buyer-web/public/sw.js`, `docker-compose.prod.yml` |

Post-phase work (chronological, kept in `PROGRESS.md` + memory):
- **Mar 2026** — Redis removed entirely (OTP storage → `otps` + `otp_rate_limits` tables); 5 Docker containers.
- **Mar 2026** — City marketplace upgrade: `City` + `Commune` models, 8 cities (2 active), city-based product filtering, dynamic per-category attribute forms (web + mobile), commune-based addresses.
- **Apr 2026** — Auth refactor: multi-provider (`User.authProvider`: `PHONE_OTP` / `EMAIL_PASSWORD` / `GOOGLE`-legacy). SMS provider abstraction (Orange DRC default, Africa's Talking fallback, Mock). Email+password register/login/forgot/reset. Seller migration flow.
- **Apr 25, 2026** — Google OAuth removed completely (endpoint deleted, deps removed). Buyer email-OTP fallback also removed. Buyer phone-input UX normalized via `normalizeDrcPhone()` single source of truth.
- **Apr 25, 2026** — Category SEO slugs (`/categorie/<slug>` canonical, `/categories/<id>` returns 308 redirect). Sample catalog: "Teka RDC Officiel" platform seller + 152 sample products seeded idempotently.
- **Apr 25, 2026** — Monolingual refactor: FR-only user-facing surface. `messages/en.json` and `app_en.arb` deleted; `locales: ['fr']`, `localePrefix: 'never'`. Translation *infrastructure* preserved.
- **May 4, 2026** — Translation schema flattened: DB stores translatable fields as plain TEXT, not `{ fr, en }` JSONB.
- **May 12, 2026** — Buyer auth migrated from phone-OTP to email + password. OtpService + OtpModule + `otps` / `otp_rate_limits` tables removed entirely. Seller migration redesigned to drop the OTP step. `User.phone` is now `String? @unique` (email-only buyers have `null`). New endpoints: `POST /v1/auth/register/buyer`, `POST /v1/auth/buyer/{migrate-check, migrate-link-email, setup-password}`. Removed (404): `/v1/auth/otp/*`, `/v1/auth/register`, `/v1/auth/login`. `SmsService` stays alive for order/broadcast notifications only.

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

---

## 10. IMPORTANT RULES

1. **Never hardcode text.** Every user-facing string must go through i18n.
2. **Never use ports 3000 or 4000.**
3. **Always keep all platforms in sync.** If a feature is implemented on web, create the corresponding mobile screens (even if simplified). Update PROGRESS.md to track parity.
4. **French is default everywhere.** Default locale, default seed data, default error messages.
5. **Test before moving on.** No phase is complete without passing tests.
6. **Commit frequently.** After every meaningful sub-task.
7. **Update PROGRESS.md after every completed task.**
8. **Use CDF (Congolese Franc) as primary currency.** Support USD as secondary (many transactions in Katanga use USD informally). Always show both when possible.
9. **Phone number format:** Always store as international format (+243XXXXXXXXX). Display with local formatting.
10. **For anything not specified:** Optimize for the DRC context (low bandwidth, French language, Mobile Money payments, phone-first UX). Reference `docs/architecture.md` for the authoritative service architecture.
11. **SMS uses a provider abstraction** at `apps/api/src/sms/interfaces/sms-provider.interface.ts` (mirrors the `PaymentProvider` pattern). Active provider is selected by the `SMS_PROVIDER` env var (`orange` | `africas_talking` | `mock`). To add a new provider, drop an implementation under `apps/api/src/sms/providers/` and wire it in the factory in `sms.module.ts`. **Never call an SMS vendor API directly** from application code — always go through `SmsService`.
12. **Auth providers — email + password only since May 2026.** Users carry an `authProvider` on the `User` model. Role-to-provider mapping is:
    - **Buyers → `EMAIL_PASSWORD`.** Self-service registration at `POST /v1/auth/register/buyer`. Legacy `PHONE_OTP` buyers migrate via `POST /v1/auth/buyer/{migrate-check, migrate-link-email, setup-password}` (phone lookup → setup link to email → click link → set password).
    - **Sellers → `EMAIL_PASSWORD`.** Self-service registration at `POST /v1/auth/register/email`. Legacy `PHONE_OTP` sellers migrate via the parallel `/v1/auth/seller/{migrate-check, migrate-link-email, setup-password}` (same flow — no OTP step).
    - **Admins → `EMAIL_PASSWORD`.** Admins are seeded out-of-band (see `docs/deployment.md § 5b`).

    Login is shared: every role authenticates at `POST /v1/auth/login/email`. Password reset is also shared (`/v1/auth/password-reset/{request, confirm}`).

    Removed endpoints (return 404): `/v1/auth/otp/request`, `/v1/auth/otp/verify`, `/v1/auth/register` (phone+OTP), `/v1/auth/login` (phone+OTP), `/v1/auth/login/google`, `/v1/auth/otp/request-email`. The `PHONE_OTP` and `GOOGLE` enum values stay on `AuthProvider` for historical accounts; no code path creates new ones.

13. **Phone-input UX (address + checkout only).** Phone is no longer collected at auth — buyers register with email. But phone is still collected at the address / delivery-contact / seller-profile surfaces. Users type 9 digits (or 10 with leading `0`); `+243` is added by the system. Single source of truth: `normalizeDrcPhone()` in `packages/shared/src/utils/phone.ts` (web) and `apps/buyer-mobile/lib/core/utils/phone.dart` (Flutter). Backend DTOs that store phone enforce `^\+243\d{9}$`. `User.phone` itself is now `String? @unique` — email-only buyers have `null`.

14. **SMS is notification-only.** `SmsService` + the Orange/AT/Mock providers stay alive but are only used for order status notifications, payment confirmations, and admin broadcasts. There is no SMS code path for authentication. Order notifications skip users with `phone = null` (mostly post-May-2026 email-only buyers).
