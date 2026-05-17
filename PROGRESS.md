# Teka RDC — Development Progress

## Current Phase: — (no active initiative; awaiting next direction)
## Last completed: COOKIE_DOMAIN production env fix + full authenticated re-verification — RESOLVED 2026-05-17
## Status: All four buyer bugs fully verified end-to-end in prod (authenticated user). Cart badge real-time (7→8 in 1.6s, no reload), cart thumbnails (8/8 render), /checkout no-redirect (loaded with stepper). Root-cause discovery: PR #81 + #83 code fixes were inert in production because `COOKIE_DOMAIN` env var was missing from .env.production — auth cookies were scoped to api.teka.cd only, invisible to teka.cd middleware. After `COOKIE_DOMAIN=.teka.cd` was added + api restarted + nginx reloaded + user re-logged in, all three flows work as designed.
## Last Updated: 2026-05-17

### Infrastructure fix — COOKIE_DOMAIN missing in prod (2026-05-17)

**Discovery**: After PRs #81/#83/#85 shipped and all code-level smoke passed, the authenticated /checkout flow STILL redirected to /connexion. Inspection from a live logged-in session showed:
- `/v1/auth/me` returned 200 (cookies present on api.teka.cd)
- `document.cookie` on teka.cd was empty — no `teka_session` hint cookie reaching teka.cd
- Manually setting a `.teka.cd`-scoped cookie via JS worked fine (no browser block)

**Root cause**: `.env.production` on the deploy VPS had no `COOKIE_DOMAIN` entry. `apps/api/src/auth/auth.controller.ts::setAuthCookies` reads `COOKIE_DOMAIN` and falls back to `undefined` (cookie defaults to request host). Auth cookies were therefore scoped to `api.teka.cd` only and never reached `teka.cd` middleware. All three PRs' code was correct — they couldn't take effect because the cookies they relied on weren't visible.

**Fix**: Added `COOKIE_DOMAIN=.teka.cd` to `/home/deploy/teka-rdc/.env.production`. Recreated api container via `docker compose up -d api` (picks up new env). Reloaded nginx (`nginx -s reload`) to repoint at the new api container IP. User re-logged in to get fresh `.teka.cd`-scoped cookies (old api.teka.cd-scoped cookies are still in browsers but unused since middleware/server now issues new ones).

**Pre-existing source-of-truth**: CLAUDE.md § 3 already documents `COOKIE_DOMAIN` (empty in dev, `.teka.cd` in prod for cross-subdomain cookies). The local `.env.production` file was missing the line. `.env.production` is gitignored so this drift wasn't catchable via CI.

**Final verification** (after the fix landed, logged-in user `+243814250002`, BUYER role):
- Bug #1 (badge real-time): 7 → 8 in 1.6 seconds after add-to-cart, no reload. ✅
- Bug #2 (cart thumbnails): 8/8 items rendered Cloudinary thumbnails, 0 placeholder SVGs. ✅
- Bug #3 (/checkout no redirect): page loaded with title "Commander | Teka RDC", stepper "Adresse → Paiement → Récapitulatif", authenticated nav ("Mon compte" / "Se déconnecter"). ✅

**Follow-up to consider**: add a startup-time warning in `apps/api/src/main.ts` — if `NODE_ENV=production` AND `COOKIE_DOMAIN` is missing OR is not a leading-dot parent domain of the API URL, log a loud `[BOOT WARNING] COOKIE_DOMAIN is not set — cross-subdomain auth will silently fail.` Optional crash-on-boot for stronger safety net. Not shipped yet; user-discretion follow-up.

### Hotfix #3 — Guest cart thumbnail hydration (2026-05-17, follow-up to #2)

**Symptom**: After PR #84 deployed, prod smoke of `/cart` as a guest still showed placeholder icons instead of product thumbnails — even though PR #83's server-side cart serializer was live and working.

**Root cause**: `apps/buyer-web/src/app/cart/page.tsx::loadGuestCart` typed its API call as `BrowseProduct` (which has `image: { url, thumbnailUrl } | null`) but actually hits `/v1/browse/products/:id` which returns `ProductDetail` (with `images: ProductImage[]` — the full gallery). Reading `p.image` was always `undefined` → `CartItemRow` rendered the placeholder icon for every guest item. The authenticated path (PR #83's serializer) was fine; only the guest hydration was broken.

**Fix** (1 file): `apps/buyer-web/src/app/cart/page.tsx` — type the response as `ProductDetail`, reshape `images[0]` to the `{ url, thumbnailUrl }` object `CartItemRow` consumes. Same transformation PR #83's server-side serializer already does for the authenticated path.

**Ship cycle**:
- PR #85 (fix → develop), 7/7 checks green, merged.
- PR #86 (release develop → main), 10/10 checks green, merged.
- Back-merged main → develop (commit 809a2df).
- Prod deploy run 25985230566 succeeded.
- Prod smoke verified: `/cart` as guest now renders the Cloudinary thumbnail for the seeded product. Screenshot confirms full cart row (image + title + seller + price + "Passer la commande" CTA).

**Pre-existing seed-data quirk surfaced**: sample products use Cloudinary demo placeholder images (`cld-sample-*.jpg`) — fruit bowls, not real product photos. Documented in memory; replace by uploading real assets to teka-rdc Cloudinary cloud and updating `seedSampleProducts()`.

### Hotfix #2 — Cart badge real-time, cart images, checkout redirect (2026-05-17)

**Symptoms** (reported together by user):
1. Cart icon doesn't update count when adding products
2. Product photos missing in cart page
3. Clicking "Passer la commande" redirects authenticated buyers to /connexion

**Root causes** (all server-side contract problems):

1. **Cart badge** — `useCartStore.fetchCart` sets `totalItems: res.data.totalItems`, but the cart API never returned that field. `undefined > 0` is `false`, so the badge stopped rendering after login (guest path computed totals locally, masking the bug pre-login).

2. **Cart images** — Cart API returned raw Prisma shape `product.images = [{ thumbnailUrl }]`. Both frontends expected something else:
   - buyer-web: `product.image?.thumbnailUrl` (singular structured object)
   - buyer-mobile: `product.thumbnailUrl` + `product.sellerName` at the product top level
   Both rendered placeholder icons.

3. **Checkout redirect** — `middleware.ts` gated `/checkout` on `teka_access_token` cookie. That cookie's maxAge is 15 minutes. Any buyer clicking checkout ≥16 minutes after login was bounced to /connexion, even though the 7-day refresh token was still alive and apiFetch's auto-refresh (PR #81) would have silently restored the session on the first request.

**Fix** (2 files):

- `apps/api/src/cart/cart.service.ts` — new private `serializeCart` helper called from every cart-returning method (`getCart`, `addItem`, `updateQuantity`, `removeItem`, `clearCart`, `mergeGuestCart`). Output shape satisfies both frontends in one payload:
  - root: `totalItems` (sum of item.quantity) + `totalCDF` (BigInt centimes, auto-string via main.ts BigInt.prototype.toJSON polyfill)
  - per product: `image: { url, thumbnailUrl } | null` (web BrowseProduct shape) AND top-level `thumbnailUrl` + `sellerName` + `sellerId` (Flutter CartItemProduct.fromJson)
  - Prisma `images` select now grabs both `url` + `thumbnailUrl` (was thumbnailUrl only)
  - `getCartSummary` (used internally by checkout) keeps reading raw Prisma via `findOrCreateCart` to avoid double-serialization
- `apps/buyer-web/src/middleware.ts` — `hasSession` accepts either `teka_access_token` OR `teka_refresh_token`. The refresh token is the real session signal; if present, page renders and `apiFetch` mints a new access token on the first request.

**Ship cycle**:
- PR #83 (fix → develop), 7/7 checks green, merged.
- PR #84 (release develop → main), 10/10 checks green, merged.
- Back-merged main → develop (commit afff312).
- Prod deploy run 25984817507 succeeded.
- Prod smoke verified:
  - Browse endpoint exposes `image: { url, thumbnailUrl }` (confirms canonical contract).
  - `/checkout` with refresh-token-only cookie returns 200 (was 307 → /connexion before fix).
  - `/checkout` with no cookies returns opaqueredirect (negative path intact — no security regression).

**Not changed**: zero client code changes — buyer-web and buyer-mobile contracts were already correct, the API was lying. Existing auth/cart flows, API surface, SEO, JSON-LD, sitemap all untouched.

**Flutter parity**:
- Bugs 1 + 2: no Flutter changes needed — model already reads the fields the new API shape provides.
- Bug 3: Flutter checkout has no middleware-level redirect, so no parity fix. (If the access token expires mid-session, the Flutter dio call fails — but that's a broader concern about adding a dio auto-refresh interceptor, deferred until it becomes an issue.)

### Hotfix #1 — Buyer session loss after navigation (2026-05-17)

**Symptom**: Buyer logs in → adds to cart → clicks logo → opens product → adds to cart → clicks logo → appears logged out.

**Root cause** (two compounding bugs):
1. `apiFetch` had no 401-refresh logic. When the 15-min access token expired mid-session, `/v1/auth/me` returned 401 → `auth-store` set `user=null` → header flipped to "Se connecter" even though the 7-day refresh token was still valid.
2. PR #80's hint-cookie gate in `fetchUser` skipped `/me` entirely when `teka_session` cookie was missing. That perf win locked out every session that predated #80 (valid tokens, no hint cookie, treated as guest).

**Fix** (3 files, +116 / -24):
- `apps/buyer-web/src/lib/api-client.ts` — `apiFetch` auto-refreshes once on 401 via `POST /v1/auth/refresh`. Refresh attempts coalesced via module-level promise so N concurrent 401s share one refresh call (no refresh-token rotation race). Loop-guarded against refresh endpoint itself. Hint-cookie gated so guests don't waste round-trips.
- `apps/api/src/auth/auth.controller.ts` — `GET /v1/auth/me` re-issues the `teka_session` hint cookie on every success (new `refreshSessionHint` private helper). Auto-heals pre-PR#80 sessions on next /me call.
- `apps/buyer-web/src/lib/auth-store.ts` — removed PR #80's hint-cookie gate from `fetchUser`. Always calls /me on AuthProvider mount; auto-refresh handles expired tokens; 1-round-trip guest cost is acceptable.

**Ship cycle**:
- PR #81 (fix → develop), 6/6 checks green, merged.
- PR #82 (release develop → main), all checks green, merged.
- Back-merged main → develop (commit c2b2a5b).
- Prod deploy run 25983908861 succeeded. Prod smoke confirmed: guest `/me` 401, no refresh follow-up (correct gate), `/v1/auth/refresh` returns 400 with no token (alive + validating).

**Not changed**: existing auth architecture, cart logic, API contracts, SEO/SSR, all flows. Only the recovery path on token expiry is new.

**Flutter parity**: Not affected — buyer-mobile uses dio with its own interceptor pipeline and doesn't share the buyer-web access-token expiry path. If a similar symptom shows up on mobile, the equivalent fix is a dio interceptor that retries on 401 via `/v1/auth/refresh`.

### Previous closeout — Buyer audit + OTP fix + stability — CLOSED 2026-05-17
- 7 audit PRs landed (#74 #75 #76 #77 #78 #79 #80). 2 P0 + 4 P1 + 3 P2 fixed. 5 regression e2e tests added. OTP Copy Code user-verified in prod. Final prod smoke clean (zero console messages on guest pageload). Flutter parity verified — no mobile changes needed.

**Detailed audit tracker**: [`tasks/buyer-audit-progress.md`](./tasks/buyer-audit-progress.md) — per-finding log with severity, status, PR# refs.

### Previous initiative — Buyer UI/UX Redesign (Rakuten-inspired) — COMPLETE 2026-05-16
- 5 PRs landed: #69 (tokens) → #70 (homepage) → #71 (conversion path) → #72 (account/auth/search) → #73 (Flutter).
- Tracker: [`tasks/buyer-ui-redesign-progress.md`](./tasks/buyer-ui-redesign-progress.md).

**Detailed redesign tracker**: [`tasks/buyer-ui-redesign-progress.md`](./tasks/buyer-ui-redesign-progress.md) — per-PR status, file lists, verification gates, and the resumption protocol.

**Plan source**: `/Users/Apple/.claude/plans/partitioned-nibbling-spark.md` (5 phased PRs, brand red `#BF0000`).

### Resumption protocol (always do this first when picking up work)
1. Read `tasks/buyer-ui-redesign-progress.md` — find the first non-`[x]` checkbox.
2. Read the plan above for the active PR's full spec.
3. `gh pr list --state all --search 'Rakuten refresh' --json number,state,title,mergedAt`
4. `git log --oneline -15 && git status`
5. Continue from that first non-`[x]` line. Tick boxes as you finish each one.

### Previous initiative — Buyer WhatsApp OTP refactor (2026-05-15)
Tracker: [`tasks/buyer-whatsapp-otp-progress.md`](./tasks/buyer-whatsapp-otp-progress.md). All milestones COMPLETED — shipped via PRs #65/#66/#67/#68. OTP delivery verified end-to-end through Gupshup `/wa/api/v1/template/msg`.

### Previous-previous initiative — Authentication Refactor

**Detailed auth tracker**: [`tasks/auth-refactor-progress.md`](./tasks/auth-refactor-progress.md) — per-milestone status with deferred items called out.

**Summary of this phase (all backend + web work shipped in this branch):**
- Prisma schema: `AuthProvider` enum, `googleId` + `passwordSetAt` on User, `PasswordResetToken`, `SellerMigration`
- SMS provider abstraction (mirrors `PaymentProvider`): Orange DRC (default prod), Africa's Talking (rollback), Mock — selected by `SMS_PROVIDER` env
- Email + password: register / login / forgot / reset (all French-first, no user enumeration, atomic refresh-token revocation on reset)
- Google OAuth: stateless `POST /v1/auth/login/google` using `google-auth-library` with upsert/link logic
- Email OTP fallback for buyers: user-initiated `POST /v1/auth/otp/request-email`
- Seller migration: existing phone-only sellers migrate via `migrate-check` → `migrate-link-email` → `setup-password` (24h JWT)
- Web apps updated: buyer-web (email fallback link), seller-web (full rewrite: login/register/migrate/setup-password/forgot/reset), admin-web (email/phone tab coexist + forgot/reset)
- Mobile apps updated: buyer-mobile (email fallback link + Google-ready repository methods), seller-mobile (full rewrite: email login + register + migrate + setup-password + forgot/reset)

**Deferred (next session)**: Google native SDK wiring in Flutter (`google_sign_in` pubspec + iOS reversed client id + Android `google-services.json`), seller-mobile deep link config for `teka-seller://setup-password`, e2e test coverage for new endpoints (~15 cases), buyer-web email+password tab + Google button.

---

## Previous Phase — City Marketplace & Dynamic Catalog Upgrade (COMPLETED 2026-03-29)

---

## City Marketplace & Dynamic Catalog Upgrade (COMPLETED)

### Phase 1: Database Schema
- [x] Added City and Commune models to Prisma schema
- [x] Added optional cityId FK to Product, Address, SellerProfile
- [x] Pushed schema to cloud PostgreSQL
- [x] Updated shared types (city.ts, product.ts, validators)

### Phase 2: Seed Data
- [x] Seeded 8 cities (Lubumbashi + Kolwezi active, 6 inactive)
- [x] Seeded 8 communes (6 Lubumbashi, 2 Kolwezi)
- [x] Deactivated old 15 main categories
- [x] Created 8 new main categories with 47 subcategories
- [x] Created 72 product attributes with rich option libraries (brands, sizes, models, etc.)
- [x] Updated existing products, addresses, seller profiles with cityId

### Phase 3: API
- [x] Created CitiesModule with public endpoints (GET /v1/cities, GET /v1/cities/:id/communes)
- [x] Added admin city management (CRUD cities + communes)
- [x] Added cityId filter to browse products API
- [x] Added public category attributes endpoint (GET /v1/browse/categories/:id/attributes)
- [x] Updated product creation to derive cityId from seller profile
- [x] Updated address service to use DB-backed city/commune data
- [x] Updated checkout to use city-based seller location for delivery fees
- [x] Updated seller application DTO with optional cityId

### Phase 4: Admin Web
- [x] Created Cities management page with enable/disable toggle and commune CRUD
- [x] Added "Villes" to sidebar navigation
- [x] Added fr + en i18n keys

### Phase 5: Buyer Web
- [x] Created city store (Zustand + localStorage persistence)
- [x] Created city selector modal (shown on first visit)
- [x] Added city indicator to header with change button
- [x] Updated home page, search page, category page to filter by selected city
- [x] Added fr + en i18n keys

### Phase 6: Buyer Mobile (Flutter)
- [x] Created city feature module (model, repository, provider, selection screen)
- [x] Added city selection redirect in router
- [x] Added city display in home screen AppBar
- [x] Updated catalog providers to filter by cityId
- [x] Added fr + en l10n keys

### Phase 7: Seller Forms — Dynamic Attributes
- [x] Seller Web: Created DynamicAttributesForm component (SELECT/MULTISELECT/TEXT/NUMERIC)
- [x] Seller Web: Integrated into product creation form with specifications submission
- [x] Seller Mobile: Created AttributeModel and DynamicAttributeField widget
- [x] Seller Mobile: Integrated into product form screen
- [x] Added fr + en i18n/l10n keys

### Phase 8: Address Forms — Commune Dropdown
- [x] Buyer Web: Added inline address creation form with city/commune dropdowns in checkout
- [x] Buyer Mobile: Added address creation bottom sheet with city/commune dropdowns
- [x] Auto-fill province/town/neighborhood strings from city/commune selections
- [x] Added fr + en i18n/l10n keys

### Phase 9: Verification
- [x] TypeScript: 0 errors (API + shared)
- [x] All 3 web builds: 0 errors (buyer-web, seller-web, admin-web)
- [x] Flutter analyze: 0 errors (buyer-mobile: 20 info, seller-mobile: 15 info — all pre-existing)
- [x] E2E tests: 67/67 pass
- [x] Documentation updated

---

## Post-Phase Refactoring — Redis Removal (COMPLETED)
- [x] Added Otp and OtpRateLimit PostgreSQL tables to replace Redis OTP storage
- [x] Refactored OtpService to use Prisma instead of Redis
- [x] Removed Redis caching from all services (settings, browse, banners, content, promotions, admin-stats, categories, products)
- [x] Removed Redis from auth service (unused import)
- [x] Removed RedisModule/RedisService from all NestJS modules
- [x] Updated health endpoints to check only database (removed Redis health checks)
- [x] Removed Redis from Docker Compose (dev + prod)
- [x] Removed ioredis dependency from package.json
- [x] Removed REDIS_* environment variables from all env files
- [x] Updated test utilities and e2e tests (removed Redis mocks)
- [x] Updated architecture.md and deployment.md documentation
- [x] Verified TypeScript compilation and builds pass

---

## Phase 1 — Foundation (COMPLETED)
- [x] 1.1–1.12 — All scaffolding tasks complete
- Monorepo, Docker, NGINX, NestJS, Prisma, Redis, shared types, Next.js apps, Flutter apps, CI

## Phase 2 — Authentication & Users (COMPLETED)
- [x] SMS OTP auth flow (Africa's Talking)
- [x] JWT access + refresh tokens with rotation
- [x] Auth guards (@Public, @Roles, @CurrentUser)
- [x] User profile CRUD, address management
- [x] Seller registration + admin approval
- [x] Auth on all 5 frontends (3 web + 2 mobile)

## Phase 3 — Product Catalog (COMPLETED)
- [x] Category tree CRUD with per-category attributes
- [x] Product CRUD (seller) with Cloudinary images, multilingual title/description
- [x] Browse API (search, filter, sort, cursor pagination)
- [x] Admin product moderation (approve/reject)
- [x] Seed data: 15 categories, 46 subcategories, 16 attributes, 20 products
- [x] All 5 frontends: catalog browsing, product detail, seller product management, admin moderation

## Phase 4 — Shopping & Orders (COMPLETED)
### Backend (API)
- [x] Prisma schema: Cart, CartItem, DeliveryZone, Order, OrderItem, OrderStatusLog models
- [x] Shared types: cart/order types, constants, validators (Zod)
- [x] Delivery Zones module: estimate fee API + admin CRUD
- [x] Cart module: getCart, addItem, updateQuantity, removeItem, clearCart, mergeGuestCart, getCartSummary
- [x] Checkout module: idempotent checkout with Prisma transaction, per-seller orders, stock decrement, delivery fee calculation
- [x] Orders module (buyer): list, detail, cancel (PENDING only)
- [x] Orders module (seller): confirm, reject, process, ship, out-for-delivery, deliver with state machine
- [x] Orders module (admin): list all with filters, detail, force status, cancel
- [x] Order notification service: French SMS templates (fire-and-forget, logger-based for now)
- [x] Seed data: 12 delivery zones, 3 cart items, 6 orders in various statuses

### Buyer Web
- [x] Cart store (Zustand): guest (localStorage) + authenticated (API) cart management
- [x] Cart page with items, quantity controls, summary
- [x] Checkout flow: address selection → payment method → review → confirm
- [x] Checkout success page
- [x] Order history with status filters and pagination
- [x] Order detail with timeline, cancel for PENDING
- [x] Cart badge in header, "Add to Cart" on product detail
- [x] i18n: Cart, Checkout, CheckoutSuccess, Orders sections (fr + en)

### Seller Web
- [x] Orders list with status filter tabs, action buttons per status
- [x] Order detail with timeline, buyer info, items, reject modal
- [x] Status badge component, sidebar nav item
- [x] i18n: Orders section (fr + en)

### Admin Web
- [x] Orders table with status/seller/buyer/date filters
- [x] Order detail with force status change, cancel
- [x] Delivery zones CRUD table with create/edit modal
- [x] Status badge, sidebar nav items
- [x] i18n: Orders, DeliveryZones sections (fr + en)

### Buyer Mobile (Flutter)
- [x] Cart feature: model, repository, provider, screen, widgets
- [x] Checkout feature: model, repository, provider, stepper screen, success screen
- [x] Orders feature: model, repository, provider, list screen, detail screen, widgets
- [x] Cart badge on home screen, "Add to Cart" wired on product detail
- [x] Router: /cart, /checkout, /checkout/success, /orders, /orders/:id
- [x] l10n: 47 new keys (fr + en)

### Seller Mobile (Flutter)
- [x] Orders feature: model, repository, provider, list screen, detail screen
- [x] Widgets: order card, status badge, action buttons
- [x] Orders nav in home screen with pending count
- [x] Router: /orders, /orders/:id
- [x] l10n: 30 new keys (fr + en)

### Verification Results
- `pnpm --filter api exec tsc --noEmit` — 0 errors
- `pnpm --filter @teka/shared exec tsc --noEmit` — 0 errors
- `pnpm --filter buyer-web build` — 0 errors
- `pnpm --filter seller-web build` — 0 errors
- `pnpm --filter admin-web build` — 0 errors
- `flutter analyze` (buyer-mobile) — 0 errors (12 info hints: deprecated APIs)
- `flutter analyze` (seller-mobile) — 0 errors (14 info hints: use_build_context_synchronously)
- `prisma db seed` — 12 zones, 3 cart items, 6 orders seeded

## Phase 5 — Payments (COMPLETED)
### Backend (API)
- [x] Prisma schema: Transaction, SellerEarning, Payout, CommissionSetting models + 3 enums (TransactionType, TransactionProvider, PayoutStatus)
- [x] Shared types: payment types, constants, Zod validators (initiatePayment, requestPayout, commissionSetting)
- [x] Environment config: FLEXPAY_* vars, PAYMENT_MOCK_MODE
- [x] PaymentProvider interface + FlexpayProvider (real) + MockPaymentProvider (dev)
- [x] Payments module: initiateOrderPayment, handlePaymentCallback (idempotent webhook), COD transactions, transaction listing
- [x] Earnings service: createEarning (idempotent, commission lookup, atomic wallet update), getSellerWallet, listSellerEarnings
- [x] Checkout integration: MM payment initiation, COD transaction creation, paymentPending response
- [x] Orders integration: COD completion on delivery, earnings trigger when DELIVERED + COMPLETED
- [x] Payouts module: seller request (balance validation), admin approve/reject (atomic reversal), payout listing
- [x] Commission module: global rate + category overrides, CRUD settings
- [x] Admin stats service: dashboard KPIs with Redis 5-min cache
- [x] Seed data: 2 commission settings, 4 transactions, 1 earning, 1 payout, wallet balance update

### Buyer Web
- [x] MM checkout: provider radio buttons (M-Pesa/Airtel/Orange) + phone input
- [x] Payment-pending page: polls every 5s for 5min, USSD instructions, success/failure/timeout
- [x] Order detail: payment status badge, pending payment warning banner
- [x] i18n: Checkout, PaymentPending, Orders additions (fr + en)

### Seller Web
- [x] Earnings dashboard: wallet balance cards + earnings/payouts tabs + payout request modal
- [x] Dashboard: wallet balance KPI card
- [x] Orders: paymentMethod + paymentStatus columns
- [x] Order detail: payment info card
- [x] Sidebar: "Revenus" nav item
- [x] i18n: Earnings, Orders additions (fr + en)

### Admin Web
- [x] Transactions page: filter bar (status/type/date/order), table with 7 columns, pagination
- [x] Payouts page: status filter tabs, approve/reject actions with modals
- [x] Commission page: global rate edit + category overrides CRUD
- [x] Dashboard: KPI cards wired to /v1/admin/stats
- [x] Orders: paymentMethod + paymentStatus columns
- [x] Sidebar: Transactions, Virements, Commissions nav items
- [x] i18n: Transactions, Payouts, Commission sections (fr + en)

### Buyer Mobile (Flutter)
- [x] Checkout: MM provider selection (colored tiles) + phone input, payment-pending navigation
- [x] Payment-pending screen: polls every 5s, USSD instructions, success/failure/timeout states
- [x] Order detail: payment status chip (color-coded)
- [x] Router: /checkout/payment-pending route
- [x] l10n: 16 new keys (fr + en)

### Seller Mobile (Flutter)
- [x] Earnings feature: models (SellerWallet, SellerEarning, Payout), repository, provider
- [x] Earnings screen: wallet cards + earnings/payouts tabs
- [x] Request payout screen: operator selection + phone input + balance display
- [x] Widgets: wallet_card, earning_tile, payout_tile
- [x] Order detail: payment info section
- [x] Home screen: earnings card + bottom nav item
- [x] Router: /earnings, /earnings/request-payout routes
- [x] l10n: 31 new keys (fr + en)

### Verification Results
- `pnpm --filter api exec tsc --noEmit` — 0 errors
- `pnpm --filter @teka/shared exec tsc --noEmit` — 0 errors
- `pnpm --filter buyer-web build` — 0 errors
- `pnpm --filter seller-web build` — 0 errors
- `pnpm --filter admin-web build` — 0 errors
- `flutter analyze` (buyer-mobile) — 0 errors (14 info hints: deprecated APIs)
- `flutter analyze` (seller-mobile) — 0 errors (14 info hints: pre-existing async context warnings)
- `prisma db seed` — 2 commission settings, 4 transactions, 1 earning, 1 payout seeded

## Phase 6 — Reviews, Wishlist & Messaging (COMPLETED)
### Backend (API)
- [x] Prisma schema: Review, Wishlist, Conversation, Message models + ReviewStatus enum
- [x] Denormalized avgRating/totalReviews on Product and SellerProfile (updated atomically in transactions)
- [x] Shared types: review + messaging types, constants, Zod validators
- [x] Reviews module: createReview (verify DELIVERED order + product in order, atomic rating recalc), getProductReviews, getProductReviewStats (1-5 distribution), getMyReviewForProduct, canReview, deleteReview (soft-delete + recalc)
- [x] Wishlist module: addToWishlist (upsert), removeFromWishlist (idempotent), getWishlist (paginated), batch check, status check
- [x] Messaging module: getOrCreateConversation, sendMessage (validates participant), getConversations (lastMessage + unreadCount + otherParty), getMessages (cursor-paginated), markAsRead, getUnreadCount
- [x] Admin reviews: listReviews (filterable), hideReview + unhideReview (with rating recalc), deleteReview
- [x] Browse extension: avgRating/totalReviews in product listings, minRating filter, sort by rating
- [x] Seed data: 2 reviews, 3 wishlists, 2 conversations, 6 messages

### Buyer Web
- [x] Product reviews component: star display, rating distribution bar, review list, write review modal
- [x] Wishlist button: heart toggle with optimistic UI
- [x] Wishlist page: paginated grid, remove button, empty state
- [x] Messages page: conversation list with unread badges, 30s polling
- [x] Chat page: message thread, input, 10s polling, optimistic send, mark as read
- [x] Product detail: reviews section + wishlist button + "Contact Seller" button
- [x] Header: wishlist link + messages icon with unread badge
- [x] i18n: Reviews, Wishlist, Messaging sections (fr + en)

### Seller Web
- [x] Reviews dashboard: product selector, stats, review list
- [x] Messages list: conversation list with unread badges
- [x] Chat page: chat interface with 10s polling, optimistic send, date separators
- [x] Dashboard: review stats card + unread messages card
- [x] Sidebar: "Avis" + "Messages" nav items (unread badge on messages)
- [x] i18n: Reviews, Messaging sections (fr + en)

### Admin Web
- [x] Reviews moderation: status tabs, table, hide/unhide/delete actions, star display
- [x] Sidebar: "Avis" nav item
- [x] i18n: Reviews section (fr + en)

### Buyer Mobile (Flutter)
- [x] Reviews: model, repository, provider, star_rating, review_tile, review_stats_bar, review_form_dialog, product_reviews_screen
- [x] Wishlist: model, repository, provider, wishlist_button, wishlist_screen
- [x] Messaging: model, repository, provider, conversation_tile, message_bubble, conversations_screen, chat_screen
- [x] Product detail: reviews section + wishlist button + "Contact Seller"
- [x] Home screen: wishlist + messages navigation icons
- [x] Router: /wishlist, /messages, /messages/:id, /products/:id/reviews
- [x] l10n: 35 new keys (fr + en)

### Seller Mobile (Flutter)
- [x] Reviews (read-only): model, repository, provider, star_rating, review_tile, seller_reviews_screen
- [x] Messaging: model, repository, provider, conversation_tile, message_bubble, conversations_screen, chat_screen
- [x] Home screen: messages + reviews navigation
- [x] Router: /messages, /messages/:id, /reviews
- [x] l10n: 22 new keys (fr + en)

### Verification Results
- `pnpm --filter api exec tsc --noEmit` — 0 errors
- `pnpm --filter @teka/shared exec tsc --noEmit` — 0 errors
- `pnpm --filter buyer-web build` — 0 errors
- `pnpm --filter seller-web build` — 0 errors
- `pnpm --filter admin-web build` — 0 errors
- `flutter analyze` (buyer-mobile) — 0 errors
- `flutter analyze` (seller-mobile) — 0 errors
- `prisma db seed` — compiles (DATABASE_URL not configured — pre-existing blocker)

## Phase 7 — Admin & Platform Operations (COMPLETED)
### Backend (API)
- [x] Prisma schema: Banner, Promotion, ContentPage, SystemSetting, NotificationBroadcast models + 5 enums (BannerStatus, PromotionType, PromotionStatus, ContentPageStatus, NotificationBroadcastStatus)
- [x] Shared types: platform types, constants, Zod validators (banner, promotion, content, setting, broadcast, report, trend schemas)
- [x] Dashboard trends: getDashboardTrends(period) with raw SQL date_trunc aggregation, Redis 10min cache, period selector (7d/30d/90d)
- [x] Banners module: admin CRUD (v1/admin/banners), public active banners (v1/browse/banners, Redis 5min), auto-activate/expire based on dates
- [x] Promotions module: admin CRUD + approve/reject (v1/admin/promotions), seller CRUD with PENDING_APPROVAL (v1/sellers/promotions), public active promotions + flash deals (v1/browse/promotions, v1/browse/flash-deals, Redis 2-5min)
- [x] Content module: admin CRUD (v1/admin/content), public pages by slug (v1/content/:slug, Redis 15min), page list endpoint
- [x] Settings module: admin GET/PUT (v1/admin/settings), public settings (v1/settings/public, Redis 1min), injectable getSetting(key) service
- [x] Broadcasts module: admin CRUD + send (v1/admin/broadcasts), async SMS sending via setImmediate with 100ms delay per SMS
- [x] Reports module: sales/financial/seller-performance reports with CSV export (v1/admin/reports), streaming CSV with UTF-8 BOM
- [x] Seed data: 3 banners (f0000000-), 3 promotions (f1000000-), 5 content pages (f2000000-), 8 system settings (f3000000-), 2 broadcasts (f4000000-)

### Admin Web
- [x] Dashboard trends: Recharts AreaChart/BarChart for Revenue, Orders, Users, GMV with period selector (7d/30d/90d)
- [x] Banners page: status filter tabs, table (thumbnail, title, status badge, dates, sortOrder), create/edit modal, delete
- [x] Promotions page: type/status tabs, table with approve/reject for seller submissions, create modal
- [x] Content page: slug-based CRUD, create/edit form (title fr/en, content fr/en textareas, status toggle), preview modal
- [x] Broadcasts page: create form (title, message with 160-char counter, segment dropdown), send with confirmation, status badges
- [x] Reports page: 3 tabs (Sales/Financial/Seller Performance), date range picker, CSV download
- [x] Settings page: toggle switches (booleans), text inputs (strings/numbers), maintenance mode highlighted card
- [x] Sidebar: 6 new nav items (Bannières, Promotions, Contenu, Diffusions, Rapports, Paramètres)
- [x] i18n: Banners, Promotions, Content, Broadcasts, Reports, Settings sections (fr + en)

### Buyer Web
- [x] Banner carousel: CSS scroll-snap, auto-advance 5s, dot indicators, pause on hover, fetches /v1/browse/banners
- [x] Flash deals section: horizontal scroll, countdown timers, discounted prices with crossed-out original
- [x] Content pages: dynamic /pages/:slug route, fetches /v1/content/:slug, locale-aware rendering, breadcrumb
- [x] Homepage: BannerCarousel replaces static hero (with fallback), FlashDealsSection between hero and categories
- [x] Footer: links to /pages/faq, /pages/terms, /pages/privacy, /pages/help, /pages/about
- [x] i18n: Banners, FlashDeals, ContentPages sections (fr + en)

### Seller Web
- [x] Promotions page: list with status badges, create modal (product selector, type, discount, dates), cancel for PENDING/DRAFT
- [x] Sidebar: "Promotions" nav item
- [x] i18n: Promotions section (fr + en)

### Buyer Mobile (Flutter)
- [x] Banner carousel: model, repository, provider, PageView widget (auto-advance, dot indicators, WidgetsBindingObserver)
- [x] Flash deals: model, repository, provider, flash_deal_card (countdown timer, discounted price), flash_deals_section (horizontal ListView)
- [x] Content pages: model, repository, content_page_screen (locale-aware rendering)
- [x] Home screen: BannerCarousel at top + FlashDealsSection after banners
- [x] Router: /pages/:slug route
- [x] l10n: 15 new keys (fr + en)

### Seller Mobile (Flutter)
- [x] Promotions: model (canCancel, discountCDFDisplay), repository, provider (StateNotifier), promotions_list_screen (FAB, pull-to-refresh, infinite scroll), create_promotion_screen (SegmentedButton, product dropdown, date pickers), promotion_card, promotion_status_badge
- [x] Home screen: promotions card between reviews and messages
- [x] Router: /promotions, /promotions/create routes
- [x] l10n: 25 new keys (fr + en)

### Verification Results
- `pnpm --filter api exec tsc --noEmit` — 0 errors
- `pnpm --filter @teka/shared exec tsc --noEmit` — 0 errors
- `pnpm --filter buyer-web build` — 0 errors (warnings only: unused vars in cart/search pages)
- `pnpm --filter seller-web build` — 0 errors (warnings only: pre-existing img/unused var warnings)
- `pnpm --filter admin-web build` — 0 errors (warnings only: pre-existing img warnings)
- `flutter analyze` (buyer-mobile) — 0 errors (17 info hints: pre-existing deprecated APIs)
- `flutter analyze` (seller-mobile) — 0 errors (15 info hints: pre-existing async context + unused import warnings)
- `prisma db seed` — compiles (DATABASE_URL not configured — pre-existing blocker)

## Phase 8 — Optimization & Production Readiness (COMPLETED)

### 8.1 API Performance — Redis Caching
- [x] Redis caching for browse service: categories (1hr TTL), product detail (5min TTL)
- [x] Cache invalidation on category create/update/delete and product update/archive
- [x] Graceful degradation (try-catch around cache ops)
- [x] RedisModule imported in browse, categories, products modules

### 8.2 Database Optimization — Composite Indexes
- [x] 11 composite indexes added to schema.prisma:
  - Order: `[buyerId, createdAt]`, `[sellerId, status]`, `[sellerId, createdAt]`, `[status, createdAt]`
  - Product: `[categoryId, status, createdAt]`, `[status, priceCDF]`, `[status, avgRating]`
  - Message: `[conversationId, createdAt]`
  - Review: `[productId, status]`
  - Transaction: `[orderId, status]`

### 8.3 Health Checks
- [x] Enhanced health controller: DB (`SELECT 1`) + Redis (`ping()`) checks
- [x] 3 endpoints: `/health` (status+checks), `/health/ready` (503 if deps down), `/health/live` (always 200)
- [x] `@Public()` + `@SkipThrottle()` decorators on health endpoints
- [x] Response includes uptime, memory usage, check durations

### 8.4 API Rate Limiting
- [x] Installed `@nestjs/throttler` — 100 requests/60s per IP
- [x] ThrottlerGuard as APP_GUARD (defense-in-depth alongside NGINX)
- [x] `@SkipThrottle()` on payment webhooks and health checks

### 8.5 SEO (buyer-web)
- [x] Server-side `generateMetadata()` on 5 key pages: homepage, product detail, category, search, content
- [x] Client components moved to `components/pages/` (home-page, product-detail-page, category-page, search-page, content-page-client)
- [x] Server-side API utility (`lib/server-api.ts`) for metadata fetching
- [x] JSON-LD structured data: Product schema on product detail pages
- [x] `robots.ts`: allows crawling, blocks /checkout /cart /orders /messages /login /register /profile /wishlist
- [x] `sitemap.ts`: static pages + dynamic products/categories from API (revalidated hourly)
- [x] `metadataBase: new URL('https://teka.cd')` + title template `%s | Teka RDC`
- [x] SEO i18n keys (fr + en)

### 8.6 Error Boundaries
- [x] `global-error.tsx` for buyer-web, seller-web, admin-web (inline styles, outside layout)
- [x] `error.tsx` for all 3 apps (Tailwind, i18n, retry + home link)
- [x] `not-found.tsx` for buyer-web (custom 404 with search suggestion)
- [x] Enhanced `http-exception.filter.ts` with structured logging (method, URL, userId) + Sentry placeholder
- [x] Errors i18n section added to all 6 locale files

### 8.7 PWA (buyer-web)
- [x] `manifest.ts`: PWA manifest (name "Teka RDC", theme_color #BF0000, standalone display)
- [x] `sw.js`: Vanilla service worker — cache-first for static assets, network-first for API, offline navigation fallback
- [x] `offline.html`: Minimal French offline page with retry button
- [x] Service worker registration in locale layout

### 8.8 Font Optimization
- [x] `next/font/google` Inter with `display: 'swap'` + CSS variable `--font-inter`
- [x] Applied `inter.variable` to `<html>` element
- [x] Updated `globals.css` font-family to use CSS variable fallback chain

### 8.9 Docker Production
- [x] `docker-compose.prod.yml`: Redis (password auth, 256MB), API (512MB, health check), 3 web apps (256MB), NGINX (SSL ports 80/443), json-file logging with rotation, frontend/backend networks
- [x] `nginx/nginx.prod.conf`: HTTPS with Let's Encrypt, HTTP→HTTPS redirect, HSTS (2yr), security headers (CSP, X-Frame-Options, etc.), 1yr static cache, gzip level 6
- [x] `.env.production.example`: All vars with production defaults, cloud DB/Redis placeholders
- [x] Root `.dockerignore`: excludes node_modules, .git, mobile apps, docs, .env.*
- [x] API Dockerfile: `HEALTHCHECK` instruction + `USER node` for non-root execution
- [x] `output: 'standalone'` added to buyer-web `next.config.ts`

### 8.10 Documentation
- [x] `docs/deployment.md` (462 lines): Prerequisites, step-by-step guide, env vars, SSL setup, monitoring, backup, updates/rollback, scaling
- [x] `docs/architecture.md` (425 lines): ASCII diagram, service architecture, data flows (auth, checkout, webhooks), DB schema, caching, security model
- [x] `docs/api-reference.md` (739 lines): All API endpoints by module (verified against 37 controllers), auth requirements, examples, error codes

### 8.11 End-to-End Tests
- [x] `test/test-utils.ts`: Comprehensive mocks (25+ Prisma model delegates, RedisService), `createTestApp()` helper, `resetMocks()` helper
- [x] `test/app.e2e-spec.ts`: 6 health check tests (ok, degraded DB, degraded Redis, live, ready, ready 503)
- [x] `test/auth.e2e-spec.ts`: 17 tests (OTP request/verify, register, login, /me, logout, refresh)
- [x] `test/browse.e2e-spec.ts`: 17 tests (categories cached/uncached, products search/filter/sort, banners)
- [x] `test/checkout.e2e-spec.ts`: 11 tests (cart auth, checkout auth, order auth)
- [x] `test/payments.e2e-spec.ts`: 6 tests (payment initiation, webhook, transactions)
- [x] Total: 57 test cases across 5 test files
- [x] `.env.test` + updated `jest-e2e.json` with moduleNameMapper + 30s timeout

### Verification Results
- `pnpm --filter api exec tsc --noEmit` — 0 errors
- `pnpm --filter @teka/shared exec tsc --noEmit` — 0 errors
- `pnpm --filter buyer-web build` — 0 errors (warnings only: unused eslint directive, unused var in product-reviews)
- `pnpm --filter seller-web build` — 0 errors (warnings only: pre-existing img/unused var warnings)
- `pnpm --filter admin-web build` — 0 errors (warnings only: pre-existing unused var warnings)
- `flutter analyze` (buyer-mobile) — 0 errors (17 info hints: pre-existing deprecated APIs)
- `flutter analyze` (seller-mobile) — 0 errors (15 info hints: pre-existing async context + unused import warnings)

---

## Monolingual Refactor — French Only (2026-04-25)

**Constraint:** Preserve API contracts. DB JSONB columns keep `{ fr, en }` shape; API responses unchanged. Only UI / URL surface goes FR-only.

### Web (3 apps)
- [x] **M1** — `routing.ts` to single locale (`locales: ['fr']`, `localePrefix: 'never'`, no detection)
- [x] **M2** — Deleted `messages/en.json` everywhere; only `fr.json` remains
- [x] **M3** — Deleted language-switcher component; stripped imports from header (buyer-web), seller-web home + dashboard layout, admin-web home
- [x] **M4** — Sitemap (`apps/buyer-web/src/app/sitemap.ts`): single-locale URLs
- [x] **M5** — Dropped `alternates.languages` from all metadata blocks (home, product, category, categorie/[slug], static [slug])
- [x] **M6** — `next.config.ts` redirects: simplified — `/pages/<canonical>` → `/<fr>` + cross-language `/<en-slug>` → `/<fr-slug>` + wildcard `/en/:path*` → `/:path*`
- [x] **M7** — `static-pages.ts`: collapsed `Record<Locale, string>` to plain `string`; dropped helpers' locale parameter
- [x] **M8** — Stripped `locale === 'en'` conditional rendering from product page metadata + all hreflang blocks

### Mobile (2 apps)
- [x] **M9** — Deleted `app_en.arb` from buyer-mobile + seller-mobile (generated `app_localizations_en.dart` left in place — harmless until next `flutter gen-l10n` run regenerates)
- [x] **M10** — Locale provider: state fixed at `Locale('fr')`, `setLocale` is a no-op, persistence dropped
- [x] **M11** — `LocaleNotifier.supportedLocales` → `[Locale('fr')]`

### Backend / DB
- **No changes.** API contract preserved per spec.

### Verification
- [x] **V1** — Type-check + production build pass for all 3 web apps
- [x] **V2** — `flutter analyze --no-fatal-infos` passes for both mobile apps (only baseline info-level deprecations)
- [x] **V3** — API e2e suite: 71/71 still pass
- [ ] **V4** — Smoke after deploy: `https://teka.cd/` renders FR; no language switcher visible; `https://teka.cd/en/<anything>` 308→`/<anything>`

### Notes
- `[locale]` route segment kept on disk (no file moves needed). With `localePrefix: 'never'`, the segment is effectively constant `'fr'` and URLs have no prefix.
- `useLocale()` calls in components stay — always return `'fr'`. Cleaner removal can come in a follow-up.
- DB JSONB shape (`{ fr, en }`) untouched. EN strings still live there but no UI surface exposes them.

---

## ALL 8 PHASES COMPLETE

The Teka RDC e-commerce marketplace is feature-complete across all 5 frontends (API, 3 web apps, 2 mobile apps) and production-ready with:
- Full authentication (phone OTP + JWT)
- Product catalog with categories, search, filters
- Shopping cart, checkout, order lifecycle
- Mobile Money payments + COD
- Reviews, wishlists, buyer-seller messaging
- Admin dashboard with full platform management
- SEO, PWA, error boundaries, health checks
- Docker production configs, SSL, documentation
- 57 e2e test cases covering critical paths
