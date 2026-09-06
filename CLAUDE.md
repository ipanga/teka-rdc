# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Teka RDC (teka.cd)

## Project Identity

**Platform:** Teka RDC — A full-featured online e-commerce marketplace for the Democratic Republic of Congo, modeled after Jumia (jumia.cd / jumia.com).
**Domain:** teka.cd
**Language:** French.
**Launch Markets:** Haut-Katanga and Lualaba provinces — specifically Lubumbashi, Likasi, and Kolwezi. Architecture must support future expansion to other provinces and towns without structural refactoring.

**Status (Sep 2026):** Feature-complete across web + mobile. All 8 build phases shipped; day-to-day work is maintenance, refactors, and incremental features — not greenfield phase work. Original feature spec + phase history live in `docs/product-spec.md`; chronological initiative history in `PROGRESS.md`; in-flight work in `STATUS.md`.

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
pnpm type-check                 # recursive tsc --noEmit — this is the real gate
pnpm lint                       # ⚠️ REWRITES YOUR WORKING TREE — see warning below
pnpm test                       # recursive: resolves in api (Jest) + buyer-web (Vitest) only
pnpm db:push                    # prisma db push (schema sync, no migration file)
pnpm db:migrate                 # prisma migrate dev
pnpm db:seed                    # tsx prisma/seed.ts with .env.development
pnpm db:reset-catalog           # wipe/rebuild taxonomy+demo catalog (dry-run; add -- --confirm)
pnpm db:studio                  # open Prisma Studio
pnpm clean                      # nuke node_modules / dist / .next / .turbo everywhere
```

> **⚠️ `pnpm lint` rewrites files.** `apps/api`'s lint script is `eslint … --fix`, so a root `pnpm lint` silently modifies ~28 api files you never touched — this is the recurring "modified files nobody edited". `apps/api` currently reports **1,044 errors / 218 warnings** raw (≈948 errors after the script's own `--fix` pass): pre-existing debt, not something you broke. **`pnpm type-check` is the real gate** — CI's `ci.yml` job is *named* "Lint & Type Check" but runs type-check only, and root lint runs only in `pr-validation.yml`, where it is explicitly non-blocking. If you do run lint, `git checkout` the incidental churn before committing.

> **What the workspace actually covers.** `apps/{buyer,seller}-mobile` have **no `package.json`**, so they are not workspace members — `pnpm lint` / `type-check` / `test` never reach them regardless of `--recursive`. Their gates are `flutter analyze` + `flutter test`, run from each app directory — and CI runs **only `flutter analyze`** on both apps, never `flutter test`, so the mobile suites are yours to run. Likewise `pnpm test` resolves only in `api` and `buyer-web`; `seller-web`, `admin-web`, and `@teka/shared` define no `test` script and are skipped silently.

### Running tests

The API uses Jest with `rootDir: "src"` and `testRegex: ".*\\.spec\\.ts$"` (inline config in `apps/api/package.json`). From `apps/api/`:

```bash
pnpm test                                  # all unit specs in src/
pnpm test -- src/reviews/reviews.service.spec.ts   # single file — path is relative to apps/api
pnpm test -- -t "should reject phone-only seller"  # filter by test name
pnpm test:watch                            # watch mode
pnpm test:e2e                              # jest --config ./test/jest-e2e.json
pnpm test:cov                              # with coverage
```

Jest matches the path argument against the *full* path, so a repo-root-relative path silently matches zero tests — always write it relative to `apps/api`.

buyer-web has a **Vitest** suite (`pnpm --filter buyer-web test`; jsdom, `vitest.config.ts`) covering middleware, sitemap, URL helpers, and a few components. **CI does not run it** — run it yourself when touching those files.

Green baseline for telling "I broke it" from "already red": **API 271 unit + 118 e2e · buyer-mobile 231 · seller-mobile 42 · buyer-web 68 (vitest).** buyer-mobile was re-run 2026-09-02 (after the PDP work); the other three were last re-run 2026-09-01.

`flutter analyze` is **not** at zero: buyer-mobile carries **6 info-level SDK deprecations** in `secure_storage.dart`, `filter_bottom_sheet.dart` and `checkout_screen.dart`. CI runs `flutter analyze --no-fatal-infos`, so infos pass and **warnings fail** — read the output by severity, not by the total count. Locally, scope it (`flutter analyze --no-fatal-infos lib test`): once an iOS build has populated the gitignored `build/`, a bare run adds ~74 *error*-level hits from vendored SDK sources that CI's fresh checkout never sees.

### Prisma workflow

The seed script uses `tsx --env-file=../../.env.development` rather than auto-loading. If you run `prisma` commands manually and hit a missing `DATABASE_URL`:

```bash
# From repo root, ad-hoc:
DATABASE_URL=$(grep '^DATABASE_URL=' .env.development | cut -d= -f2-) \
  pnpm --filter api exec prisma db push
```

After editing `apps/api/prisma/schema.prisma`: run `pnpm db:push` (cloud DB, no migration files in dev) then `pnpm --filter api prisma:generate` if your IDE doesn't pick up new types.

`apps/api` also defines `prisma:seed:prod` and `prisma:reset-catalog:prod` (both `--env-file=../../.env.production`); neither has a root alias.

For production, schema changes ship as **idempotent** manual SQL under `apps/api/prisma/migrations/manual/YYYY-MM-DD_*.sql` (wrap in `IF NOT EXISTS`, guard data updates). Two apply paths — full detail in `docs/deployment.md §5a`:

1. **Auto-applied during deploy** — add the filename to `manual/auto-apply.list`; `deploy.yml` runs `prisma/migrations/apply-auto.sh` (which sits *above* `manual/`, not inside it) **before the rolling swap**, tracking applied files in `_manual_migrations`. **Additive/backward-compatible only** — the old code keeps serving while it runs.
2. **Manual** — the `Apply prod migration` Action (Actions tab → Run workflow → paste the filename) for destructive/contract-phase migrations. It docker-execs into the *running* api container, so the file must already be on `main`. The api image bundles `postgresql-client`.

Two further `workflow_dispatch` prod-ops Actions exist: **`Run prod seed`** (`SEED_MODE=prod` — foundational data only, never real users/orders) and **`Run prod notification backfill`**. Both require typing `RUN` and are concurrency-locked against the deploy group, so neither can race a rollout.

### Docker

```bash
docker compose up               # 5 services: api, buyer-web, seller-web, admin-web, nginx
docker compose -f docker-compose.prod.yml up    # production stack (cloud DB, SSL via nginx.prod.conf)
```

**No local Postgres or Redis container** — the DB is cloud-hosted via `DATABASE_URL`. Redis went in March 2026; the OTP tables that briefly replaced it went in May 2026 with phone-OTP auth.

### Flutter (mobile)

Both apps ship **three product flavors** (`development` | `staging` | `production`) so builds co-install. `flutter run`/`build` **without `--flavor` fails** with `no matching variant` — always pass `--flavor` *and* the matching `--dart-define-from-file`. The flavor (API base URL, Sentry DSN, …) is baked in at compile time via `lib/core/config/flavor.dart`. **Full reference: `docs/mobile-flavors.md`.**

```bash
# Run (from apps/buyer-mobile or apps/seller-mobile):
flutter run --flavor development --dart-define-from-file=flavors/development.json
flutter run --flavor production  --dart-define-from-file=flavors/production.json
flutter test                                 # unit tests (flavor not needed)
flutter pub run build_runner build           # regenerate Riverpod / freezed code
```

Dev/staging APKs need per-flavor `google-services.json` (CI injects from secrets) or they fail at `:processGoogleServices*` — see `docs/mobile-flavors.md`.

**Mobile release CI** — all `workflow_dispatch`-only, per app buyer/seller/both. Android: `release-mobile-aab.yml` + `build-mobile-apk.yml`. iOS: `release-mobile-ipa.yml` (signed prod IPA via Fastlane `match` → dSYM→Sentry → `ios-testflight` approval gate → TestFlight) + `build-mobile-ipa.yml`. Load-bearing: both apps share Apple team `YK6Z393A4D`; certs live in the private `teka-ios-certs` match repo; the committed pbxproj stays `CODE_SIGN_STYLE=Automatic` (CI flips it to Manual ephemerally); every TestFlight upload needs a higher `CFBundleVersion`. `ci.yml`'s **`Release Config`** job guards the app → tester-group mapping via `fastlane/testflight_groups_test.rb` — it exists because five releases once uploaded cleanly and reached nobody. **Full runbook + secrets + gotchas: `docs/mobile-release.md`** (root `Gemfile`/`fastlane/` hold the Fastlane setup).

### Branching (see CONTRIBUTING.md for full detail)

Two-branch GitHub Flow: `develop` is the active working branch, `main` is release-only and updated **only** via `gh pr merge --merge` (never `--squash` — squashes cause permanent SHA divergence and phantom conflicts on later back-merges). A pre-push hook at `.githooks/pre-push` blocks direct pushes to `main`. After a hotfix lands on `main`, immediately back-merge `main → develop` to close the loop.

---

## 1. CONTEXT & CONSTRAINTS (DR Congo Realities)

Before making ANY architectural or UX decision, internalize these constraints:

- **Unreliable internet:** Most users are on 2G/3G with frequent drops. Pages must be lightweight (<200KB initial payload ideally), images lazy-loaded and aggressively compressed, and API responses paginated and minimal. Consider offline-first patterns for the mobile app (queue actions, sync when online).
- **Low-end devices:** Target Android 8+ devices with 2GB RAM. Avoid heavy JS bundles on web. Flutter apps must be optimized for low memory.
- **Cash on Delivery only** since 2026-05-26. No payment provider abstraction exists — re-introducing automated payments means building one. Details: **Rule 11** + §2 Payments row.
- **French, written as literals.** There is no localization layer anywhere — not in the three Next.js apps, not in the two Flutter apps, not in the DB (translatable fields are plain TEXT). Details: **Rule 1**.
- **Logistics are local:** No national postal system. Delivery is handled by local riders/drivers. Delivery zones are based on towns/neighborhoods, not postal codes. Support seller self-delivery + platform-managed delivery options.
- **Auth is role-specific; phone is always the delivery contact.** Buyers = phone + WhatsApp OTP; sellers + admins = email + password. Details: **Rule 12 + Rule 13** (they win over any older description).
- **Power outages:** Users may lose connection mid-transaction. All critical flows (checkout, payment confirmation, order placement) must be idempotent and resumable. Use server-side state machines for order lifecycle.

---

## 2. TECH STACK

### Backend

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js + NestJS 11 | |
| Database | PostgreSQL | Cloud-hosted (Neon/Supabase/Railway) — **no local instance**. `DATABASE_URL` in the root env files |
| ORM | Prisma 6 | |
| Cache & Queues | **None** (Redis removed Mar 2026) | API throttling via `@nestjs/throttler` (in-memory). |
| Auth | JWT access + refresh; role-specific | Buyers = WhatsApp OTP (Gupshup); sellers/admins = email+password. See **Rule 12**. |
| Media Storage | Cloudinary | Max 5MB, auto-compress to WebP. |
| Email Service | Resend.com | French templates in `apps/api/src/email/templates/`. |
| Push | Firebase Cloud Messaging | Primary order-event + broadcast channel. See **Rule 14** + `docs/push-notifications.md`. |
| Payments | **COD only** | `CheckoutService` writes `Transaction{provider:COD}`; `markDelivered()` → `COMPLETED` **and** creates the seller earning in the same transaction (commission snapshotted per item: seller override → category → platform default; never recomputed). Seller payouts are manual: admin approve ≠ paid, conditional transitions + audit, 409 on retry. No provider/webhook. `MOBILE_MONEY`/`FLEXPAY` enums kept for historical rows. → `docs/payouts.md` |
| Reverse Proxy | NGINX | SSL, routing, rate limiting, gzip. `nginx/nginx.conf` (dev) / `nginx.prod.conf`. |
| Containerization | Docker + Docker Compose | 5 dev services (api, 3 web, nginx). Cloud DB — no local Postgres. |
| CI/CD | GitHub Actions | type-check → test → build → deploy. **Lint is not an enforced gate** — see the §0 warning. |
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

No `[locale]` route segment, no middleware locale handling, no language switcher — routes live directly under `src/app/` and navigation uses `next/link` + `next/navigation` (Rule 1).

> **IMPORTANT:** Ports 3000 and 4000 are already in use locally. Never use them.

### Deployment

Every merge to `main` ships via GitHub Actions, **zero-downtime**. `develop` is the integration branch; releases are real merge PRs `develop → main` (§0 Branching + CONTRIBUTING.md — never squash).

### Mobile (Flutter)

**buyer-mobile** is the consumer app (the primary interface for most customers); **seller-mobile** is the seller dashboard (products, orders, earnings). Android ships via APK + Play Store; **iOS ships to TestFlight**. Both apps have a git-tracked native `ios/` project (Runner workspace + Podfile + per-flavor xcschemes; `Pods/`, `Generated.xcconfig`, `GoogleService-Info.plist` gitignored). iOS is newer than Android — **verify tooling assumptions against `docs/mobile-release.md` rather than assuming parity.**

### Repository Layout

**pnpm workspace** monorepo — everything is under `apps/*` or `packages/*` (no flat `api/`, `buyer-web/`):

- `apps/` — six apps (see the tables above). Each Next app's `src/` is App Router (`app/`, `components/`,
  `lib/`, `middleware.ts`); the api's `src/` is domain modules; `apps/api/prisma/` holds schema + seed +
  migrations. The two Flutter apps are Riverpod + go_router + dio, and are **not** pnpm workspace members.
- `packages/shared` — `@teka/shared`: types, constants, Zod validators, `normalizeDrcPhone`, cookie names.
- Root: `docker-compose{,.prod}.yml`, `.env.{development,production,test}` (root-level, NOT per-app),
  `nginx/`, `scripts/`, `Gemfile` + `fastlane/` (iOS release tooling), `tasks/` (gitignored local trackers —
  **not** a backlog). Root `package.json` has a `pnpm.overrides` block pinning security-patched transitive
  deps — **don't strip it during dependency work.**

**`docs/` index** (read `architecture.md` first):
`architecture.md` (authoritative service architecture) · `product-spec.md` (feature spec + 8-phase
history) · `url-and-seo-strategy.md` (city-first URLs/slugs/redirects) · `analytics.md` (PostHog) ·
`clarity.md` (Microsoft Clarity) · `api-reference.md` · `deployment.md` (§5b admin seeding) ·
`mobile-connectivity.md` (Rule 15) · `mobile-flavors.md` · `mobile-release.md` (Android signing + Play Store;
**iOS TestFlight CI/CD** — match signing, dSYM→Sentry, approval gate) ·
`payouts.md` (seller payouts + settlement) · `delivery-fees-and-currency.md` (zone-based delivery fees +
FC display + money convention) · `order-workflow.md` (**Teka-managed** lifecycle: collection → delivery → COD cash →
2-day return window → payout; financials, returns, response-shape contract, **delivery-address snapshot**) · `push-notifications.md` (FCM) ·
`session-management.md` (per-surface cookies + token rotation) · `sentry.md` ·
`deep-linking.md` (App Links / Universal Links + DeepLinkParser) ·
`town-architecture-refactor.md` + `town-switcher-ux.md` (data-driven town selection) ·
`app-review-login.md` (store-reviewer OTP bypass — ships disabled).

Everything else in `docs/` is a **dated initiative tracker** (`*-redesign.md`, `*-fixes.md`, `*-audit.md`, …)
— per-initiative history, not current behaviour. Prefer `architecture.md` + the Rules below. Not enumerated
here on purpose: the set grows every initiative and listing it re-trips the size warning. `ls docs/`.

---

## 3. ENVIRONMENT CONFIGURATION

`.env.development` (dev), `.env.production` (prod), and `.env.test` (API tests) live at the **repo root**, not per-app. Every workspace reads from these — the api via `tsx --env-file=../../.env.development`, the Next.js apps via the built-in loader. **There is no `.env.example`** — the authoritative variable list is the Joi schema at `apps/api/src/config/env.validation.ts`; add every new API var there (with a dev-safe default, or the app crash-loops when an operator strips it) plus the three root env files.

Key categories (see `env.validation.ts` for the full list):

- **Database** — `DATABASE_URL` (cloud Postgres; no local instance)
- **Database** / **Media & email** / **Service URLs** — `DATABASE_URL`; `CLOUDINARY_*`, `RESEND_API_KEY`, `EMAIL_FROM`; `API_URL`, `{BUYER,SELLER,ADMIN}_WEB_URL`, `CORS_ORIGINS`
- **Auth** — `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRY`, `JWT_REFRESH_EXPIRY`, `COOKIE_DOMAIN` (empty in dev, `.teka.cd` in prod for cross-subdomain cookies), `BCRYPT_ROUNDS`, `*_EXPIRY_MINUTES`/`_HOURS`. Cookies are **per-surface** since 2026-06-18 — `teka_{admin,seller,buyer}_{access,refresh,session}`, chosen by the `X-Teka-Surface` header — so the three sessions stay isolated and logout is session-scoped. Refresh rotates with a 15s grace window (no revoke-all on benign races). → `docs/session-management.md`.
- **Error monitoring** — `SENTRY_DSN` (empty in dev → init skipped, `captureException` a no-op), `SENTRY_RELEASE` (optional git short-sha for per-release grouping)
- **Push (FCM)** — `PushService` takes either `GOOGLE_APPLICATION_CREDENTIALS` (path to a service-account JSON) **or** the trio `FIREBASE_PROJECT_ID`/`FIREBASE_PRIVATE_KEY`/`FIREBASE_CLIENT_EMAIL` (the trio wins when both are set); no-op when neither is set. **Never commit the JSON.** → `docs/push-notifications.md`.
- **WhatsApp OTP** — `WHATSAPP_PROVIDER` + `GUPSHUP_*` (Rule 14). Mobile keys are per-flavor.
- **App-review login** — `APP_REVIEW_LOGIN_ENABLED` (default `false`) + `APP_REVIEW_BUYER_PHONE_E164`/`APP_REVIEW_BUYER_OTP`: a fixed-OTP bypass for store reviewers. **Prod stays `false`** — flip on only during an active review window, then off. → `docs/app-review-login.md`.
- **Payments** — none. COD-only since 2026-05-26.
- **Mobile release CI** (iOS *and* Android signing) uses GitHub Actions *repo secrets*, not env-file vars — don't add them to the root env files. Full inventory → `docs/mobile-release.md`.

Removed / not in use: `REDIS_URL`, `GOOGLE_*_CLIENT_ID`, all `ORANGE_*`/`FLEXPAY_*`/SMS vars. (`OTP_EXPIRY_MINUTES` is **not** removed — it was restored 2026-05-15 for buyer WhatsApp OTP.)

---

## 4. CORE FEATURES (Jumia feature parity)

The platform is **feature-complete** (buyer / seller / admin across web + mobile). The full
role-by-role feature spec is in **`docs/product-spec.md`** (historical reference). For *current*
behaviour the authoritative sources are §10 (Rules) below + `docs/architecture.md` — where the original
spec and current behaviour differ (auth, payments, SMS), **the Rules win.**

The models below are the ones most often got wrong. Each is a one-line summary + the authoritative pointer —
read the pointer before changing anything in that area.

**Catalog taxonomy + brands.** 3-level **Category → Subcategory → Product Type**, built by reusing the
self-referential `Category` tree — **there is no `ProductType` table**, product types are `Category` nodes
(`16000000-` UUID range), and **products link to the leaf**. Brands are a first-class `Brand` library
(`Product.brandId`), **not** a "Marque" attribute. Seeded ids are non-RFC4122 → validate by DB lookup, never
`@IsUUID`. Defined in `apps/api/prisma/taxonomy-data.ts`; reset via `pnpm db:reset-catalog`.
→ `docs/architecture.md` → "Marketplace taxonomy + brands".

**Demo catalog + retirement (P3c).** Seeded "Teka RDC Officiel" products (`Product.isDemo=true`) keep the
storefront non-empty and always rank below real ones. Auto-retirement ships **dormant** — `RETIRE_DEMO_CATALOG`
defaults to `false`; leave it off until real merchants populate categories.
→ `docs/architecture.md` → "Demo-catalog retirement (P3c)".

**Per-product discounts.** Seller-set `Product.discountPriceCDF`/`discountPriceUSD`, always-on and separate
from the admin `Promotion`/flash-deal model. Effective price = `discountPriceCDF ?? priceCDF`; the percentage
is derived on display, **never stored**; `OrderItem.listUnitPriceCDF` snapshots the original.
→ `docs/architecture.md` → "Per-product discounts".

**Broadcast notifications.** Admin → buyers via `/v1/admin/broadcasts`, **fan-out on write** onto the
user-scoped `UserNotification` feed + FCM. Opt-outs gate push/email delivery only — **never the feed**. Buyers
read the unified `/v1/notifications`. → `docs/architecture.md` → "Notifications & broadcasts".

**Universal deep linking (buyer-mobile).** `https://teka.cd/...` opens the app when installed, else the
website. `apps/buyer-mobile/lib/core/deep_link/deep_link_parser.dart` **mirrors** buyer-web `lib/urls.ts` —
**adding a deep-linkable route means updating both, plus a test.** → `docs/deep-linking.md`.

---

## 5. DATABASE DESIGN PRINCIPLES

Conventions in force: UUID primary keys, soft deletes (`deletedAt`), `createdAt`/`updatedAt` everywhere,
indexes on FKs + filtered columns (`status`, `categoryId`, `sellerId`) + full-text search columns. The
non-obvious ones:

- Translatable fields are stored as plain TEXT (French) — no JSONB shape, no per-locale columns
- Location hierarchy: Country → Province → Town → Neighborhood (seeded for Haut-Katanga & Lualaba initially)
  - **Naming caveat (Town Architecture Refactor, Jun 2026):** the *data layer* still uses **`City`** — `model City`, `cityId`, `User.preferredCityId`, `GET /v1/cities`, `CitiesModule`, Flutter `features/city/`, web `useCityStore`. The *UX/URL/copy layer* renamed it to **"town / ville"** — header town selector, first-visit town modal, town-scoped browsing, `/{ville}` SEO landing pages. So a "town" in the UI maps to a `City` row in the DB; don't expect a `Town` model. Towns are **data-driven** (`City.heroImageUrl`/accent color/slug) — no hardcoded Lubumbashi/Kolwezi switches. Full model: `docs/town-architecture-refactor.md` + `docs/town-switcher-ux.md`.
- Order state machine: enum + transition log table for audit trail. See `docs/order-workflow.md`
- **One address per buyer, enforced server-side.** `POST /v1/addresses` is an **upsert**: with an address
  on file it updates that row rather than creating a second, inside a transaction that row-locks the owner.
  Buyers only — sellers/admins keep multi-address. There is no DB unique constraint, because a partial index
  on `addresses("userId")` cannot be scoped by `users.role` and would silently cap sellers too. Neither buyer
  client exposes an address book. → `docs/buyer-cart-sync-and-single-address.md`
- **An order's delivery address is a SNAPSHOT, not the FK.** `Order` carries its own `delivery*` columns,
  written at checkout, because a buyer's single address is editable and reading through
  `deliveryAddressId` would retroactively rewrite past orders. All reads go through
  `resolveDeliveryAddress()`; **never join to `addresses` for a historical value.**
  → `docs/order-workflow.md` → "Delivery address — snapshot, not the live row"
- **Monetary values: smallest unit (centimes for CDF) as BigInt**, never float. Always store the currency code alongside the amount. Serialized as strings in API responses

---

## 6. API DESIGN PRINCIPLES

Routes are REST under a global `api` prefix, so controllers declare `v1/...` (not `api/v1/...`). Validation is
class-validator + class-transformer on DTOs, Zod in `@teka/shared`. Pagination: cursor for feeds, offset for
admin tables. Uploads go multipart → backend → Cloudinary, never to local disk. The part worth memorizing:

- **Response envelope (as actually emitted):** success → `{ success: true, data: T }`; error → `{ success: false, error: { status, message, errors?: [{ field, message }] } }`. `ResponseInterceptor` wraps any return value lacking a `success` key — so a controller returning `{ data, meta }` passes through with `meta` intact, and **there is no global meta-hoisting**. `HttpExceptionFilter` builds the error shape. Note `error.status` (the HTTP code), **not** `error.code`.
- Rate limiting is in-memory `@nestjs/throttler`, stricter on auth endpoints; `@SkipThrottle()` on health.

---

## 7. DEVELOPMENT WORKFLOW & CONTINUITY SYSTEM

### 7.1 Progress tracking (CRITICAL)

Three files, distinct jobs: **`STATUS.md`** = what is in flight *right now* (rewritten in the same commit
that starts or ends an initiative — no drift window); **`PROGRESS.md`** = the append-only chronological
record; **`CLAUDE.md`** = durable rules only, never history. Update `PROGRESS.md` after each completed
task, `STATUS.md` at initiative boundaries.

### 7.2 Resumption protocol

**Read `STATUS.md` first** — before this file, before `PROGRESS.md`. If `## Active initiative` says
"None", there is no in-flight work: don't infer one from a stale plan file or from memory. If it names a
per-initiative tracker (they live in **`docs/`** — note `tasks/` is gitignored, so nothing there survives
for the next session), read that next. Then `CLAUDE.md` for context, `PROGRESS.md` for history,
`git log --oneline -20`, and the test suites to confirm the current state before changing anything.

Plan files under `~/.claude/plans/*.md` are session artifacts that outlive the work. Cross-reference any
plan against `STATUS.md` and git history before executing it — its existence is not evidence it is pending.

### 7.3 Git & testing discipline

Commit per completed sub-task as `feat|fix|chore|docs|refactor(scope): description` (scopes in
CONTRIBUTING.md; multi-scope like `fix(api,buyer-mobile,buyer-web)` is established practice). Never commit
a red tree. Services, validators and utils get unit specs; API endpoints get e2e specs via the NestJS
testing module (`apps/api/test/`). Seed data stays realistically Congolese — French names, Lubumbashi
addresses, CDF prices — because it is what every screenshot and demo runs on.

---

## 8. IMPLEMENTATION HISTORY

Built in 8 sequential phases (all shipped); post-phase work continues as discrete initiatives. The
**8-phase table** is in `docs/product-spec.md`, the **chronological history** in `PROGRESS.md`
("Post-phase chronology"). The load-bearing constraints those initiatives created live as Rules in §10 —
read those for what to *do*.

> **Do not append initiative history to this file** — it re-trips the 40k-char performance warning.
> `PROGRESS.md` is the chronological record.

---

## 9. DESIGN GUIDELINES

Material Design 3 on mobile; clean, premium, fast-loading on web (Jumia's layout as reference, not its feel).
Mobile-first for buyer-web — most traffic is a phone browser. WCAG 2.1 AA minimum. Two that are easy to skip
and matter more here than elsewhere: **always skeleton-load images** (critical on 2G/3G, not a nicety), and
give **empty states a CTA** / **error states French copy + a retry action**.

### Design system (web + mobile)

The brand red is **`#C8102E`** — "Modern Ruby", set in the 2026-06-21 buyer-web redesign. The tonal scale is `--color-primary-50` … `--color-primary-900` in `apps/buyer-web/src/app/globals.css`; `--color-primary` always points at the 600 step (hover = 700, pressed = 800, subtle = 50/100). **Don't introduce new hex literals for the brand color** — use the token (`bg-primary`, `text-primary`, `--color-primary-700`, etc.).

> The older `#BF0000` was superseded. It still appears hard-coded in `apps/api/src/email/templates/*.template.ts` (inline-styled email HTML) — **those templates are the stale ones**; don't "correct" the design token to match them.

Town accents (`lib/city-accent.ts`) are subtle badge/chip accents only — **not** per-city themes.

**Authoritative token sources (keep in sync when adjusting):**
- Web: `apps/buyer-web/src/app/globals.css` — `@theme inline {}` block. Defines color scale, neutrals, status colors, radius (sm/md/lg/xl/2xl/full), shadow (xs/sm/md/lg/xl), typography vars.
- Mobile: `apps/buyer-mobile/lib/core/theme/teka_colors.dart` + `app_theme.dart`.

**Web UI primitives:** `apps/buyer-web/src/components/ui/` — small in-repo set built on Tailwind v4 + `class-variance-authority`. Exports: `Button`, `Badge`, `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`, `Input`, `Label`, `Container`, `SectionHeader`, the `buttonVariants`/`badgeVariants`/`cardVariants` helpers, and `cn`. **No shadcn** — these primitives are intentionally minimal; add new ones only when a pattern repeats ≥3 times. Domain components (`ProductCard`, `CartItemRow`, etc.) live under `components/{product,cart,...}/` and consume these primitives.

---

## 10. IMPORTANT RULES

1. **All user-facing text is French — written directly, not localized.** No localization layer exists on any of the six surfaces. **Flutter:** write French literals straight in the Dart widgets; the gen-l10n stack (`app_fr.arb`, generated `AppLocalizations`, `l10n.yaml`) was removed (buyer-mobile 2026-06-22, seller-mobile 2026-06-23) — never add an ARB key or re-introduce gen-l10n. **Web:** next-intl was fully removed from all three Next.js apps (2026-06-23) — never re-introduce `next-intl`, `messages/fr.json`, `src/i18n/`, `NextIntlClientProvider`, or the `createNextIntlPlugin` wrapper. (Framework `GlobalMaterialLocalizations`/`GlobalWidgetsLocalizations` stay pinned to `fr` — that's Flutter rendering its own widgets, not our layer.)
2. **Never use ports 3000 or 4000.**
3. **Keep all platforms in sync.** A feature shipped on web gets its mobile counterpart — simplified is fine — in the same initiative. Track parity in `PROGRESS.md`.
4. **French only.** No language switcher, no `/en/` URLs, no per-locale columns. See Rule 1.
5. **Test before moving on.** Nothing is complete without passing tests.
6. **Commit per sub-task**, never on a red tree.
7. **Update `PROGRESS.md` after every completed task**; `STATUS.md` at initiative boundaries.
8. **CDF is the primary currency**, USD secondary (Katanga trades informally in USD) — show both where you can.
9. **Phone format:** store international `+243XXXXXXXXX`, display with local formatting. It is the delivery contact for every role and *also* the auth identifier for buyers — see Rule 13.
10. **For anything unspecified:** optimize for the DRC context (low bandwidth, COD, WhatsApp-OTP buyers). `docs/architecture.md` is the authoritative service architecture.
11. **SMS is gone (2026-05-26)** — `apps/api/src/sms/` (Orange DRC, Africa's Talking, mock) was deleted. Order events ride **Push (FCM) primary + Email (Resend) fallback** via `OrderNotificationService`; admin broadcasts ride **Push + Email** with a per-broadcast `channels` toggle via `BroadcastsService`; buyer OTP rides **WhatsApp/Gupshup** (Rule 14). **Do not re-introduce SMS** without a written architecture decision — the removal closed a load-bearing outage gap (operator-stripped env vars + missing Joi tolerance → 2026-05-24 crash loop). Payments are COD-only from the same initiative: no provider abstraction exists, and `MOBILE_MONEY`/`FLEXPAY` enum values survive only to render historical rows.
12. **Authentication is role-specific (since 2026-05-15).** **Sellers + admins = email + password** (`/v1/auth/{register/email, login/email}`; sellers self-register → admin approval, admins are seeded out-of-band per `docs/deployment.md § 5b`). **Buyers = WhatsApp OTP via Gupshup** (`/v1/auth/buyer/otp/*`) — verify either signs into the User matched by phone or creates a new BUYER, capturing optional `firstName/lastName` on first verify; the legacy 2026-05-12 → 2026-05-15 email-only cohort claims via `/v1/auth/buyer/claim/*`. **Full endpoint table + payloads: `docs/api-reference.md § Auth`; cookies + rotation: `docs/session-management.md`.**

    Three consequences that bite:
    - **Phone uniqueness is global** (`User.phone @unique`) — so if a phone already belongs to a seller, the buyer OTP flow signs into *that seller account*; buyer-web detects `user.role === 'SELLER'` post-verify and redirects to `SELLER_WEB_URL`.
    - **Password reset is sellers + admins only.** Buyers have no password: a reset request from a buyer email returns a neutral 200 but creates no token. The 3-day email+password cohort uses `/reclamer-compte` instead.
    - **Retired auth routes return 404 by design** — legacy phone-OTP + Google, the email+password buyer register, and both the buyer and seller migration flows (seller retired 2026-05-18; `SellerMigration` + `SELLER_SETUP_EXPIRY_HOURS` are residual). Leaving them unregistered *is* the deprecation signal — **don't restore them.** Full list + dates in `docs/api-reference.md`.

    `AuthProvider` keeps `PHONE_OTP`, `EMAIL_PASSWORD`, and `GOOGLE`; live code creates only `PHONE_OTP` (OTP buyers) and `EMAIL_PASSWORD` (sellers, admins, and the unclaimed email-buyer cohort).

13. **Phone is buyer auth identifier AND delivery contact.** For sellers + admins, phone stays delivery-only (collected at the address / seller-profile surfaces). For buyers since 2026-05-15, phone is *also* the auth identifier — set on first WhatsApp OTP verify and required from that point. Users type 9 digits (or 10 with leading `0`); `+243` is added by the system. Single source of truth: `normalizeDrcPhone()` in `packages/shared/src/utils/phone.ts` (web) and `apps/buyer-mobile/lib/core/utils/phone.dart` (Flutter). Backend DTOs that store phone enforce `^\+243\d{9}$`. `User.phone` is `String? @unique` globally; email-only buyers (the 3-day claim cohort) have `null` until they complete `/reclamer-compte`.

14. **Three messaging surfaces, three providers.** Each has a single, narrowly-scoped responsibility:
    - **`PushService`** (`apps/api/src/push/`, FCM) — primary channel for buyer + seller order events and admin broadcasts. Multicast per user (many `DeviceToken` rows each); auto-invalidates rejected tokens. **No env-driven provider selection** — one backend only.
    - **`EmailService`** (`apps/api/src/email/`, Resend) — fallback for buyer order events when push has 0 active tokens; plus transactional email (verification, password reset, seller setup, buyer claim, contact-form) and broadcasts. Dev mode logs to console.
    - **`WhatsappService`** (`apps/api/src/whatsapp/`, Gupshup) — **buyer OTP only** (login + register + claim). Never notifications or broadcasts. `WHATSAPP_PROVIDER` selects `gupshup` | `mock`; the factory **refuses to silently mock in production**. OTP is generated with `crypto.randomInt`, stored as `sha256` hex.

    The three stacks never call each other — adding an email template must not touch Push or WhatsApp code, and vice versa.

15. **Mobile connectivity discipline (since 2026-05-27).** Both Flutter apps ship a centralized 5-state connectivity machine (`connected | unstable | noInternet | disconnected | reconnecting`) at `apps/{buyer,seller}-mobile/lib/core/connectivity/` + interceptor stack at `…/core/network/`. **Full reference: `docs/mobile-connectivity.md`** — read it before touching anything below.

    Hard rules when adding or modifying network code in either Flutter app:
    - **Never bypass the Dio chain** — always go through `core/network/api_client.dart`. The order `OfflineAware → Auth → Retry → Log` is load-bearing; retries must flow through auth attach.
    - **Never set `Options(extra: {'retryable': true})` on a non-idempotent call.** Retryable-by-default is `GET` + `HEAD` only. Checkout, OTP request/verify/resend, buyer claim, seller login, seller order transitions, payouts, and product publish/update are **not** retry-safe — replaying them races state.
    - **Multipart uploads go through `postMultipartWithAuthRetry`** (`core/network/multipart_upload.dart`, both apps). It rebuilds the body and sends exactly once more **only** when the AuthInterceptor stamped `authRefreshedExtraKey` on the 401 (refresh succeeded, consumed-FormData replay failed). Never hand-roll a 401 retry around `dio.post(FormData)`, and never retry without that marker — a rejected refresh must surface, not upload twice.
    - **Never call an OTP / payment vendor directly from app code.** Those are server concerns; the app talks to `${baseUrl}/v1/…` only.
    - **Always mirror buyer-mobile changes into seller-mobile (and vice versa) in the same PR.** The layer is kept in lockstep — today the only divergence is doc-comment wording in `offline_aware_interceptor.dart` and `sentry_scrub.dart`, and **behaviour must never diverge**. `diff -r` the two `lib/core/{connectivity,network}/` dirs before calling a mirroring PR done.
    - **Always surface network errors via `core/network/dio_error_messages.dart`** — no per-feature `_extractErrorMessage(DioException)` copies. It passes an API 4xx `message` through **verbatim**, so anything a controller can throw must be French: use `UuidParam` (`apps/api/src/common/pipes/uuid-param.pipe.ts`), never raw `ParseUUIDPipe`, on buyer-facing params.
    - **Always show snackbars via `showAppSnackbar`** (`core/widgets/app_snackbar.dart`) — it pins behaviour/margin/shape so both apps render identically despite only seller-mobile having a `snackBarTheme`. Connectivity is announced by `ConnectivityToastHost`; **never re-introduce a banner in the widget tree** — it shifts every route's layout.
    - **Never log credentials, tokens, phone numbers, or query strings** from the connectivity layer or the Sentry reporter. `core/config/sentry_scrub.dart`'s `beforeSend` scrubs phones globally — don't undo it.
    - **State mutations are hard-blocked offline** by `OfflineAwareInterceptor`. Do not add a "queue and replay" fallback without an architecture decision — the original design rejected it deliberately (replay races price + stock during the offline window).
