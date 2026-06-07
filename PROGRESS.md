# Teka RDC — Development Progress

## Current Phase: Mobile Parity Sweep (2026-06-06/07, 5 phases #293–#297 — shipping)
## Last completed: SEO / city-first URL refactor (2026-06-06, shipped #290) + connexion-bounce fix (#292)
## Status: buyer-mobile/seller-mobile audited vs recent web/API changes; only the genuine gaps closed (city-scoped category+search, wishlist count badge + inactive handling, full client PostHog ecommerce events, seller-account-on-buyer-OTP guard, dead-code cleanup). Apps were already largely at parity. Tracker: `tasks/mobile-parity-sweep-progress.md`.
## Last Updated: 2026-06-07

## Post-phase chronology — condensed index (moved out of CLAUDE.md §8 on 2026-06-03)

> This is the authoritative chronological index of post-phase work. CLAUDE.md §8 now points here instead of carrying the list inline (the growing list kept tripping the 40k-char CLAUDE.md performance warning). Append new initiative one-liners here, not to CLAUDE.md. Full narratives for each item live in the dated sections further down this file and in `STATUS.md`.

- **Mar 2026** — Redis removed entirely; 5 Docker containers.
- **Mar 2026** — City marketplace upgrade: `City` + `Commune` models, 8 cities (2 active), city-based product filtering, dynamic per-category attribute forms (web + mobile), commune-based addresses.
- **Apr 2026** — Auth refactor: introduced email + password as the email/password path; SMS provider abstraction (Orange DRC default, Africa's Talking fallback, Mock); seller migration flow scaffolded.
- **Apr 25, 2026** — Google OAuth removed entirely (endpoint deleted, deps removed).
- **Apr 25, 2026** — Category SEO slugs (`/categorie/<slug>` canonical, `/categories/<id>` returns 308 redirect). Sample catalog: "Teka RDC Officiel" platform seller + 152 sample products seeded idempotently.
- **May 2026** — Platform reduced to French only; all multi-locale UI plumbing collapsed and DB translatable fields flattened to plain TEXT.
- **May 14, 2026** — `[locale]` URL routing removed entirely from all 3 Next.js apps. Routes flattened (`app/[locale]/x` → `app/x`). `next-intl` middleware integration + `createNavigation` Link/useRouter wrappers + `i18n/routing.ts` + `i18n/navigation.ts` all deleted. `next-intl` kept solely as a French-only string loader for `messages/fr.json`. Component-level `useTranslations()` calls untouched. Pages that read `useSearchParams()` (login flows: reset-password, setup-password, payment-pending) wrapped in `<Suspense>` to satisfy Next.js 15 prerender rules. `next.config.ts` redirects strip both `/en/*` and `/fr/*` legacy locale prefixes to the un-prefixed path.
- **May 12, 2026** — **Phone-OTP auth removed everywhere.** All roles (buyer, seller, admin) authenticate with email + password. `OtpService` + `OtpModule` + `otps` / `otp_rate_limits` tables deleted. Seller migration redesigned to drop the OTP step. `User.phone` is now `String? @unique` (email-only buyers have `null`). New endpoints: `POST /v1/auth/register/buyer`, `POST /v1/auth/buyer/{migrate-check, migrate-link-email, setup-password}`. Removed (404): `/v1/auth/otp/*`, `/v1/auth/register`, `/v1/auth/login`. `SmsService` is notification-only now (orders, payments, broadcasts).
- **May 15, 2026** — **Buyer auth reverted to WhatsApp OTP (via Gupshup).** Sellers + admins keep email + password. `Otp` + `OtpRateLimit` tables restored (sha256-hashed codes, never plaintext). New `WhatsappModule` + `WhatsappService` + `Gupshup/Mock` providers (separate from `SmsService` — notification SMS stays untouched). New `BuyerOtpService` + `BuyerClaimService`. Endpoints added: `POST /v1/auth/buyer/otp/{request, verify, resend}`, `POST /v1/auth/buyer/claim/{request, verify}`. Endpoints removed (return 404): `POST /v1/auth/register/buyer`, `POST /v1/auth/buyer/{migrate-check, migrate-link-email, setup-password}`. Hard cutover, no feature flag — rollback is `git revert`. Email-only legacy buyers (3-day window 2026-05-12 → 2026-05-15) use the new `/reclamer-compte` claim flow to attach a phone. `BuyerMigration` repurposed for the claim flow (new columns: `tempPhone`, `claimEmailSent`). New env vars at root: `WHATSAPP_PROVIDER`, `GUPSHUP_API_KEY/APP_NAME/SOURCE_NUMBER/BASE_URL/OTP_TEMPLATE_ID`. Production keeps `WHATSAPP_PROVIDER=mock` until the Gupshup template UUID is approved (typically 24–48h after submission).
- **May 25–26, 2026** — **Orange + Africa's Talking SMS + Flexpay Mobile Money removal** (10-PR initiative, A1 → D3). Triggered by the 2026-05-24 outage in which an operator stripped `ORANGE_*`/`FLEXPAY_*` env vars from `.env.production` before the API was made tolerant — Joi validation crash-looped the api container for ~2h. Sequencing was code-first, env-strip-second: A1/A2/A3 added Push (FCM) primary + Email (Resend) fallback for order events and per-channel push+email for admin broadcasts; B1/B2 deleted the Mobile Money checkout UI + entire Flexpay provider/webhook/factory and tightened the checkout DTO to `paymentMethod: 'COD'` only; B3 wired the admin broadcasts UI to the channels payload; C1 dropped the 14 stale env keys from Joi validation (operator then stripped `.env.production` safely); C2 deleted `apps/api/src/sms/` entirely (`SmsService`, `SmsModule`, Orange DRC + AT + mock providers, the SMS branch in `BroadcastsService`, the `smsBroadcasts` opt-out), relaxed the broadcast message cap 160 → 500 chars, and removed the SMS checkbox from admin-web; D1 converted sample seed orders/transactions from FLEXPAY/MOBILE_MONEY to COD; D2 swept docs + `.env.example` (this entry); D3 marked initiative complete in `STATUS.md` and archived the plan file. Net effect: ~1450 lines deleted, ~250 added across 50+ files; 16 PRs merged + 8 release PRs. The `PaymentMethod.MOBILE_MONEY` and `TransactionProvider.FLEXPAY` enum values stay on the Prisma schema for historical-row display only; new rows are always COD. Re-introducing SMS or automated payments would mean adding a new provider abstraction from scratch — none currently exists.
- **May 27, 2026** — **Mobile connectivity management** (7-PR initiative). Both Flutter apps gained a centralized 5-state connectivity machine + 4-layer Dio interceptor chain (`OfflineAware → Auth → Retry → Log`), a global connectivity banner, lifecycle pause/resume, SharedPreferences cart persistence, hard-block checkout offline, and rate-limited Sentry capture. Enshrined as **Rule 15**; authoritative reference `docs/mobile-connectivity.md`. The two trees are kept byte-for-byte identical for the connectivity layer.
- **Jun 2026** — **PostHog analytics on buyer-web** (#257). Client-side events, session replay, and feature flags. Setup + conventions in `docs/analytics.md`. No API involvement.
- **Jun 2026** — **Microsoft Clarity on buyer-web + seller-web** (#260). Heatmaps + session recordings, client-side only. Setup in `docs/clarity.md`. Also: `uuid` pinned to `^11.1.1` via pnpm override for GHSA-w5hq-g745-h8pq (#258).
- **Jun 3–4, 2026** — **PostHog platform rollout** (8-PR initiative, PR-1→8; #262–#268 + docs). Extended PostHog from buyer-web-only to **all 6 surfaces**: api (`posthog-node` `@Global AnalyticsModule`/`PostHogService` — server-owned auth/order/payment/admin events, PR-1→3), seller-web + admin-web (cloned the buyer-web provider; PR-5/6), buyer-web custom UI event taxonomy (PR-4), and both Flutter apps (`posthog_flutter`, screen+lifecycle+identity, lockstep; PR-7). One US-Cloud project; `distinctId = user.id` everywhere; identity carries **id+role only** (never phone/email); each event has ONE authoritative owner (server=transactional, client=UI-intent — no duplication); `api_error`/`notification_sent` deliberately excluded. `POSTHOG_API_KEY` wired into the api container via deploy.yml/compose; web keys are build-arg secrets; mobile keys are per-flavor. Decisions: single prod project + dev keys empty (R2 fixed). Authoritative reference rewritten platform-wide in `docs/analytics.md`. CLAUDE.md §2 tech-stack row updated. (Deferred: custom buyer-mobile ecommerce events; server-side flag bootstrap; replay↔Sentry linking.)
- **Jun 7, 2026** — **Initiative #1 (Real Catalog & Merchant Supply) — Phase 1: Seller self-onboarding** (4 sub-PRs #304–#307). Audit first found the live catalog is **100% seeded sample** (Teka Officiel seller `10000000-…-999999`, products `31000000-…`, picsum images; 0 real merchants) and a **dead-end defect**: `register/email` assigns role SELLER but `/sellers/apply` required role BUYER → a fresh merchant got 403 on apply and couldn't list products either. Phase 1 unblocks real merchant onboarding end-to-end. **P1a** (#304): widened the apply guard to `@Roles('BUYER','SELLER')` (product creation stays gated on `applicationStatus==='APPROVED'`, so role-SELLER-without-profile is inert) + service spec. **P1b** (#305): seller-web `/inscription` (registration) + `/devenir-vendeur` (business-application form → `POST /v1/sellers/apply`; city select from `/v1/cities`; phone via `normalizeDrcPhone`) with PENDING/REJECTED states; `dashboard/layout` approval gate redirects unapproved sellers to the application flow. **P1c** (#306): seller-mobile mirror — new `seller_application` feature (repo + screen), `/devenir-vendeur` route + router approval gate, ported `normalizeDrcPhone` byte-for-byte from buyer-mobile (Rule 13 SSOT; seller-mobile had none), and login/register now refresh via `checkAuthStatus()` so auth state carries `sellerProfile` (login response omits it). **P1d** (#307): `reviewSellerApplication` now notifies the seller by **email** (two French Resend templates: approved = welcome+next-steps+dashboard CTA; rejected = reason+resubmit CTA) **+ push** (FCM via `SellerNotificationService`), fire-and-forget. Decisions locked: KYC = ID/RCCM photo + manual review (Phase 2); sample retirement = `isDemo` flag + rank-real-above-demo + SEO-safe per-category phase-out (Phase 3). Out of scope: external RCCM/sanctions integrations, vision-API moderation, variant SKUs, 3rd-party inventory sync. Verified-false agent claim (excluded): "no stock decrement" — checkout decrements atomically (`checkout.service.ts:195`). Tests green throughout (api 51 unit + 92 e2e; seller-web build/lint; seller-mobile analyze/test). **Phase 1 shipped to prod (release #308) + verified.** **Next: Phase 2 (KYC docs) — review-gated.**
- **Jun 7, 2026** — **Initiative #1 Phase 1 — QA pass** (4 fixes #309–#312, released after #308). Post-Phase-1 review surfaced four issues, each fixed as a separate PR. **QA-4** (#309): the admin Vendeurs list rendered `User.phone` — null for email-registered sellers, since the application phone lives on `SellerProfile.phone` — so it showed "—"; now selects + renders `SellerProfile.phone` and the search covers boutique name + seller phone (the placeholder promised both but searched neither). **QA-2** (#310): the verification email links to `${SELLER_WEB_URL}/verify-email?token=` but seller-web had no such route → Next 404; added the `/verify-email` page (Suspense/token pattern) that auto-calls `GET /v1/auth/email/verify` and shows verifying/success/error states. **QA-3** (#311): admins had no signal for pending applications; added `pendingSellerApplicationsCount` to the admin stats → a dashboard "Demandes vendeurs en attente" alert card (shown only when >0) + a count badge on the Vendeurs sidebar item. **QA-1** (#312): added required **Commune** to the application — `SellerProfile.communeId` (nullable column so existing rows stay valid; required in DTO/forms), idempotent prod migration `2026-06-07_seller_commune.sql`; `apply()` validates the commune and **derives `cityId` from it** (city + commune can't disagree); dynamic Commune dropdown filtered by Ville (reset on city change, prefilled on resubmit) on **both** seller-web + seller-mobile; commune names returned in `getApplication` + admin `findUserById`. Decision: commune nullable-column + required-in-form (no legacy backfill). Tests green (api 55 unit + 92 e2e; seller-web build; seller-mobile analyze/test). Shipped to prod (release #313) + verified; commune migration applied.
- **Jun 7, 2026** — **Initiative #1 Phase 2 — Seller KYC** (4 sub-PRs #314–#317). ID/RCCM document photo + **manual** admin review. Locked decisions: **private storage + signed admin URLs**, **single required photo**, no external/automated verification. **P2a** (#314, API): `SellerProfile.idDocumentCloudinaryId` + `idDocumentUploadedAt` (nullable → existing rows valid; required at DTO/form layer; idempotent prod migration `2026-06-07_seller_kyc_document.sql`); `CloudinaryService.uploadPrivateImage` (Cloudinary `type:authenticated` — not publicly accessible) + `getSignedImageUrl` (signed, expiring); `POST /v1/sellers/documents` (multipart, 5MB, image MIME) → returns the private `public_id`; `ApplySellerDto.idDocumentCloudinaryId` **required + folder-constrained** (`^teka-rdc/seller-documents/`, so a client can't point at an arbitrary asset); `apply()` persists it + stamps `idDocumentUploadedAt`; `GET /v1/admin/sellers/applications/:id/document` → admin-only short-lived **signed URL** (404 when absent). **P2b** (#315, seller-web): `/devenir-vendeur` document upload control (compress → `/v1/sellers/documents`), upload/✓/error states, blocks submit until attached, sends `idDocumentCloudinaryId`, prefills prior doc on REJECTED. **P2c** (#316, seller-mobile): mirror — `uploadDocument(File)` repo method + `image_picker` control + same required-before-submit/prefill behavior. **P2d** (#317, admin-web): "Voir la pièce" action in the Vendeurs list → fetches the signed URL → preview modal (+ open-in-new-tab); shown alongside approve/reject. Security: KYC docs are authenticated/private, the raw URL 401s without a signature, admin viewing is a short-lived signed URL generated on demand and never persisted, DTO rejects public_ids outside the private folder. Tests green (api 61 unit + 92 e2e; seller-web + admin-web builds; seller-mobile analyze/test). **Next: Phase 3 — sample-catalog coexistence/retirement (review-gated).**
- **Jun 7, 2026** — **Delivery-fee preview quick win** (single PR `feat/delivery-fee-preview`). The delivery fee was already computed correctly server-side at checkout, but the **preview** was broken: buyer-web called `/v1/delivery-zones/estimate` with no `fromTown` (→ 400 → fee shown as `0`), and buyer-mobile showed a hardcoded `--` with the order total **omitting the fee entirely**. Fix: new `POST /v1/checkout/quote` endpoint backed by a shared `CheckoutService.resolveDeliveryFee(sellerId, toTown, tx?)` extracted from `checkout()` — so the previewed fee equals the charged fee **by construction** (same code path, same `DeliveryZonesService.estimateFee(fromTown, toTown)`, `fromTown` from the seller's city/location, fallback `Lubumbashi`). buyer-web `/paiement` now POSTs the quote on address-select and maps `sellerQuotes[].deliveryFeeCDF`; buyer-mobile gained a `CheckoutQuote` model + `getQuote()` repo method + `deliveryFeeCDF`/`isLoadingQuote` on `CheckoutState` (fetched on auto-select/select/create, stale-response-guarded) and now renders the real fee + `subtotal + fee` total. Tests: 4 API unit specs (empty-cart/missing-address throw, per-seller breakdown summed + `estimateFee` arg parity, `fromTown` fallback) + 3 mobile model/parity specs. **Non-goals held:** no City/Commune delivery-zone redesign, no logistics ops, no pricing-model change. **Zone-records fix (#302 → release #303, applied to prod):** the prod `delivery_zones` table was **empty** because `seedDeliveryZones` only ran in the dev-only Phase 4 block — *after* the `if (isProd) return` in seed.ts — so all orders fell back to the **5,000 CDF default**. Fix shipped both layers: (a) extracted module-level `seedDeliveryZones()` called **before** the prod return so it runs in dev + prod (idempotent upsert, now updates feeCDF/feeUSD on conflict); (b) idempotent migration `apps/api/prisma/migrations/manual/2026-06-07_seed_delivery_zones.sql` (`INSERT … ON CONFLICT (fromTown,toTown) DO UPDATE`, exact seed values + deterministic IDs) applied to prod via the "Apply prod migration" Action (`INSERT 0 12`). **Verified live:** all 4 launch routes return seeded fees with `isDefault:false` — Lub→Lub 3,000 · Kol→Kol 3,000 · Lub↔Kol 15,000. Checkout quote + final order pricing consume the same `estimateFee` path, so both now use seeded values, not the default.
- **Jun 7, 2026** — **Mobile Parity Sweep** (5-phase initiative, #293–#297). Audited buyer-mobile + seller-mobile vs recent web/API changes; found the apps **already largely at parity** (auth, cart, checkout, orders, profile, Sentry, connectivity, seller-mobile all solid) and closed only the genuine gaps. **P1** (#293): category + search now pass `cityId` (home already did) → city-scoped listings; product/city models parse the new `slug`/`shortCode`/`city*` fields. **P2** (#294): wishlist header **count badge** via `GET /v1/wishlist/count` + optimistic ±, and inactive/deleted-product add now surfaces the real API reason. **P3** (#295): buyer-mobile fires the full **client ecommerce PostHog event set** (`product_viewed`, `category_viewed`, `search_performed`, `add_to_cart`, `remove_from_cart`, `checkout_started`; query scrubbed) — closed the documented deferral; `docs/analytics.md` updated. **P4** (#296): a buyer OTP that resolves to a **SELLER** account is now blocked with a "use the seller app" dialog (+ session cleared) — mobile can't deep-link the seller APK. **P5** (#297): removed seller-mobile's dead `/auth/migrate` button; buyer OTP uses the server `cooldownSeconds`. **Decisions:** D1 keep mobile auth-required + blocking city gate (web guest flows N/A on native). **Deferred (backlog):** seller-mobile dashboard stats breakdown, PDP related-products. Closeout also slimmed **CLAUDE.md** 38.6k→~29.5k (moved feature spec + phase table to `docs/product-spec.md`). Tracker: `tasks/mobile-parity-sweep-progress.md`.
- **Jun 6, 2026** — **SEO / city-first URL refactor** (7-phase initiative, #283–#289; **shipped to prod release #290**; follow-up stale-token `/connexion` bounce fix #291→#292). buyer-web moved to a **city-first** URL scheme: `/{ville}`, `/{ville}/{slug}-{shortCode}` (product), `/{ville}/categorie/{slug}` (city-scoped category). The product DB `slug` became **clean/cosmetic, city-free, non-unique**; a new `Product.shortCode` (6-char base36, `@unique`) is the resolver, and `City.slug` is the `{ville}` segment (idempotent prod migration `2026-06-06_city_first_urls.sql` adds the columns + md5/slug backfill). Browse resolver = UUID→shortCode→slug. Storefront routes renamed to **French** (`/cart→/panier`, `/checkout→/paiement`, `/orders→/commandes`, `/wishlist→/favoris`) with 301/308 redirects (incl. legacy flat product URLs → canonical via the `/[ville]` dispatcher). Homepage **de-blocked** (no forced city modal — fully crawlable). SEO surface (canonical = city URL, sitemap city-paths, JSON-LD Accueil→Ville→Catégorie→Produit, robots) all city-aware. Single URL builder `apps/buyer-web/src/lib/urls.ts`. **Mobile + analytics untouched by design** (ID-based go_router, no `teka.cd` intent-filters; analytics impact is dashboard-only). Decisions: D1 city-scoped categories, D2 clean-slug+shortCode, D3 buyer-web-only renames. Authoritative reference: `docs/url-and-seo-strategy.md`. Tracker: `tasks/seo-city-url-refactor-progress.md`.
- **Jun 5, 2026** — **Wishlist (Favorites) completion & hardening** (6-PR initiative; #272–#274 web/API merged + PR-4/5/6 mobile/docs). The feature already existed end-to-end but was incomplete; audited all 3 surfaces then completed to ecommerce best-practice. **API:** `GET /v1/wishlist/count` (active-filtered, for the header badge); add now rejects non-ACTIVE/deleted products (was selectable); `/check` UUID-filtered; new service unit spec (11) + 2 e2e auth contracts. **buyer-web:** `wishlist-store` (ids Set + batch `/check` hydrate → no per-card N+1; optimistic toggle); heart on ALL listing surfaces (ProductCard home/category/search + flash-deals, sibling overlay); header count badge (`WishlistBadge`); `/wishlist` add-to-cart (keeps item) + stock status + error/retry; **guest heart → `/connexion?redirect=` → auto-completes the pending add after login** (safe-redirect guarded). **buyer-mobile:** heart overlay on product cards + `loadWishlistIds` hydration; seller name on the wishlist card; add-to-cart on the wishlist card. **Analytics:** kept `wishlist_added`/`wishlist_removed`, added `wishlist_viewed` + `wishlist_item_moved_to_cart` on both web + mobile (no PII). Decisions: guest auto-continue; keep shipped event names; add-to-cart keeps the item. Authz/IDOR + dedup verified. `docs/api-reference.md` + `docs/analytics.md` updated.

### Initiative — Mobile connectivity management (2026-05-27, 7 PRs: #243 → #255)

**Brief**: Both Flutter apps (`buyer-mobile` + `seller-mobile`) needed network-state awareness for DRC's 2G/3G reality — frequent drops, captive portals at cafés, shared cell-towers that flake under load. Letting Dio time out after 30s meant users tapped "Payer" three times and rage-quit. This initiative built the layer: state-aware, retry-where-safe, fail-fast-where-not, surface-state-visibly.

**Authoritative reference**: `docs/mobile-connectivity.md`. CLAUDE.md Rule 15 enshrines the hard rules.

**Locked decisions (2026-05-27)**:
- Reachability probe is `${ApiConstants.baseUrl}/v1/health` — no `internet_connection_checker_plus` dep. The probe target equals what the API considers "alive."
- Cart persists to SharedPreferences. Cart **mutations** when offline are blocked (no queue-and-replay) — replay would race price + stock during the offline window.
- Order placement when offline is hard-blocked at the checkout review step (button + permanent French banner). No queue-and-replay anywhere.
- The two Flutter trees are kept byte-for-byte identical for the connectivity layer; changes ship in lockstep.
- Cache wiring is opt-in. Today only the cart is wired; product/category/profile/seller-order keys reserved.

**PR sequence (each feature-PR has a paired develop→main release-PR; smoke after every deploy)**:

- **PR1 — Core foundation** (#243 → #244). `ConnectivityStatus` enum + `ConnectivitySnapshot`. `ConnectivityService` with injectable `interfaceStream` (defaults to `connectivity_plus`) + injectable `probe` (defaults to Dio GET `/v1/health`, 3s timeout). 30s healthy cadence; 5s `noInternet` cadence; **2-slow-probes-to-unstable / 1-fast-out** hysteresis. Riverpod providers (`connectivityServiceProvider`, `connectivitySnapshotProvider`, `connectivityStatusProvider`, `isOnlineProvider`, `isOfflineProvider`). `connectivity_plus ^6.0.0` added. 10 unit tests. CI surprise: `flutter analyze --fatal-warnings` flags warning-level issues that local analyze logs as info — must remove unused fields not just deprecate them.
- **PR2 — Dio integration** (#245 → #246). `RetryInterceptor`: full-jitter backoff `[0..500ms, 0..1500ms, 0..4000ms]` capped 5s, GET/HEAD only or `Options(extra: {retryable: true})` opt-in. Retries on `connectionTimeout` / `receiveTimeout` / `sendTimeout` / `connectionError` + HTTP 502/503/504. `OfflineAwareInterceptor`: synthesizes `DioException(type: connectionError, error: 'offline', message: 'Pas de connexion internet — la requête ne peut pas être envoyée.')` on non-safe verbs when disconnected. `Options(extra: {allowOffline: true})` opt-out. **Chain order**: `OfflineAware → Auth → Retry → Log` (load-bearing — retries must flow through auth attach). `AuthInterceptor` now distinguishes connectivity-caused refresh failure (`connectionTimeout` / `receiveTimeout` / `sendTimeout` / `connectionError` / `502/503/504`) from real 401s — tokens preserved on the former. No more "logged out on the bus" footgun. 19 unit tests using hand-rolled `HttpClientAdapter` mocks.
- **PR3 — Global UI banner** (#247 → #248). `ConnectivityBannerHost` mounted via `MaterialApp.router.builder`. Red `disconnected`, orange `noInternet` / `unstable` / `reconnecting`, green `restored` (3s only). Key state: `_previousOfflineStatus` only tracks `disconnected` + `noInternet` — `reconnecting → connected` on app startup must NOT flash a green banner. `AnimatedSize` 200ms + `AnimatedSwitcher` 200ms. 5 new `app_fr.arb` keys + regen of `app_localizations*.dart`. Widget tests need a `_settleEmission` helper (pumps 2 frames + 350ms) to clear AnimatedSwitcher cross-fade. 8 widget tests.
- **PR4 — Lifecycle integration** (#249 → #250). `ConnectivityLifecycleObserver`: `ConsumerStatefulWidget + WidgetsBindingObserver`. `paused / inactive / hidden → service.pause()` (stops probe timer; saves battery). `resumed → service.resume()` (immediate probe + restart timer). Deliberately does **not** invalidate authProvider on resume — PR2's auth interceptor already handles "tokens still valid, just couldn't reach the server." 8 widget tests using `_SpyConnectivityService` with overridden pause/resume.
- **PR5 — Offline behavior** (#251 → #252). `TypedCache`: SharedPreferences-backed envelope `{v:1, savedAt: ISO, ttlMs, value}`. Methods: `write<T>`, `read<T>`, `evict`, `evictPrefix`. Returns `CacheEntry<T>` with `isFresh` + `age` getters. Stale-while-reconnecting: always returns value if present. `main.dart` preloads `SharedPreferences` then `ProviderScope(overrides: [sharedPreferencesProvider.overrideWithValue(prefs)])` — previously threw `UnimplementedError`. `CartNotifier` hydrates synchronously from cache (`_hydrateFromCache()` on construct) + write-through (`_persistToCache()` on success). 30-day TTL. Silent on offline `DioException` — connectivity banner already tells the story. Checkout review step watches `isOfflineProvider`: place-order button disabled + permanent banner "Connexion requise pour passer commande" with `Icons.wifi_off_outlined`. 9 unit tests using `SharedPreferences.setMockInitialValues`.
- **PR6 — Sentry monitoring** (#253 → #254). `ConnectivitySentryReporter`: subscribes to connectivity stream, sets `connectivity_state` tag + structured `connectivity` context on every snapshot via `Sentry.configureScope`. Breadcrumb (category `connectivity`) on every transition. Rate-limited (1/min/category) captures on `connected → noInternet` (real degradation, not clean drop) + `sustained_noInternet` (≥5 consecutive). `RetryInterceptor` got `_maybeCaptureBudgetExhaustion()` (also 1/min) for full retry-budget exhaustion. Read-once-instantiate Riverpod pattern matching `pushControllerProvider`. **Privacy**: only connectivity status + latency + short error tag + HTTP method + URL path. No query strings, no payloads, no tokens, no phones. The existing `core/config/sentry_scrub.dart` phone-scrubber is untouched. Switched from deprecated `setExtra` to recommended `setContexts` to silence info-level lint warnings.
- **PR7 — Docs + cleanup** (#255 → #256). New **`docs/mobile-connectivity.md`** — single landing page: ASCII state diagram, retry policy table, offline behavior matrix, observability signals, "adding a new feature" checklist, deferred work list, file map. **CLAUDE.md Rule 15** — hard rules: never bypass the Dio chain, never `retryable: true` on non-idempotent calls, never call SMS/OTP/payment vendors directly from app code, mirror buyer-mobile ↔ seller-mobile in the same PR, surface errors with the shared helper, never log creds/tokens/phones, state mutations are hard-blocked offline. **`docs/architecture.md`** gains a "Mobile network-resilience layer" subsection in Data Flow. **Cleanup**: 6 byte-identical copies of `_extractErrorMessage(DioException)` in buyer-mobile feature providers (catalog / checkout / cart / orders / wishlist / reviews) deduped into a single shared top-level `extractDioErrorMessage()` at `apps/buyer-mobile/lib/core/network/dio_error_messages.dart`. Net cleanup: −108 lines. Stale code comments in both `offline_aware_interceptor.dart` files updated to reference the new helper. STATUS.md closeout (active initiative → None) + plan archived locally to `~/.claude/plans/archive/mobile-connectivity-management.shipped.md`.

**Files added** (mirrored byte-for-byte in seller-mobile):
```
apps/buyer-mobile/lib/core/connectivity/
├── connectivity_status.dart                 enum + ConnectivitySnapshot
├── connectivity_service.dart                state machine + probe loop
├── connectivity_provider.dart               Riverpod providers
├── connectivity_lifecycle_observer.dart     WidgetsBindingObserver bridge
├── connectivity_sentry_reporter.dart        observability
└── widgets/
    └── connectivity_banner.dart             global banner widget

apps/buyer-mobile/lib/core/network/
├── offline_aware_interceptor.dart           fail-fast for non-safe calls when disconnected
├── retry_interceptor.dart                   full-jitter exponential backoff
└── dio_error_messages.dart                  French error-string helper (PR7 dedup)

apps/buyer-mobile/lib/core/cache/
├── typed_cache.dart                         SharedPreferences-backed cache
└── cache_keys.dart                          reserved key constants
```

`auth_interceptor.dart` + `api_client.dart` were modified, not added.

**Verification**:
- Tests: 54/54 buyer-mobile specs across `connectivity_service_test.dart` (10), `retry_interceptor_test.dart` (9), `offline_aware_interceptor_test.dart` (10), `connectivity_banner_test.dart` (8), `connectivity_lifecycle_observer_test.dart` (8), `typed_cache_test.dart` (9).
- `flutter analyze --no-fatal-warnings`: 18 baseline issues buyer-mobile / 14 baseline seller-mobile, no new issues introduced by any PR.
- CI: 7/7 checks green on every PR (Lint & Type Check, Analyze (actions), Analyze (javascript-typescript), API Tests, Flutter Analysis ×2, CodeQL).
- Post-release smoke (2026-05-27 20:11 UTC): API health 200, db ok, uptime 413s; all 6 removed endpoints still 404; all public read endpoints respond <1s; all 3 web surfaces 200.
- **Emulator walkthrough** (2026-05-27, `emulator-5554` Android): production-flavor APK installed, exercised every visible signal — orange "Connexion instable" on slow probe; red "Pas de connexion internet" + inline French error after killing wifi/data (verifying `OfflineAwareInterceptor` synthesis + `extractDioErrorMessage` rendering); green "Connexion rétablie" caught in its 3s window; clean resume from HOME→relaunch (PR4 pause/resume). PR5 cart persistence + PR6 Sentry capture not exercised (would need real login + a configured Sentry DSN — both out of scope for a CLI walkthrough).

**Net effect across the initiative**: ~1300 lines added, ~150 removed across 50+ files. 14 PRs total (7 feature + 7 release).

**Decisions captured for future maintainers** (also in STATUS.md + `docs/mobile-connectivity.md`):
- The two Flutter trees are kept byte-for-byte identical for the connectivity layer. PR diffs that touch one and not the other should be rejected at review.
- No queue-and-replay anywhere (cart, checkout, anything stateful). The offline window can be arbitrarily long; replay would race price + stock.
- Cache wiring is opt-in. `productsList` / `categoriesTree` / `userProfile` / `sellerOrdersList` keys are reserved in `cache_keys.dart` but not yet used — future opt-in pass.
- Re-introducing SMS still requires a written ADR (Rule 11 unchanged). Re-introducing automated payments would need a new provider abstraction from scratch.

**Ship cycle**: 7 feature PRs (#243, #245, #247, #249, #251, #253, #255) each followed by a release PR develop→main (#244, #246, #248, #250, #252, #254, #256). Every deploy ran clean; prod was healthy after each.

---

### Initiative — seller-mobile multilingual cleanup (2026-05-20, PR #123 → #124)

**Brief**: Mirror of PR #117 (buyer-mobile cleanup) for the seller-mobile app. After the jsonb→text DB migration (PR #112), the API serves plain French for every translatable field; the defensive `{ 'fr': value }` Map wrapping in 4 seller-mobile models was preserving a shape the API no longer returns.

Also drops bilingual fields from the create-promotion form (same fix that shipped to the product form in PR #120).

**Models simplified (4)**:
- `features/products/data/models/attribute_model.dart` — AttributeModel.name: Map → String. Drop `getLocalizedName`.
- `features/products/data/models/product_model.dart` — CategoryModel.name; SellerProductModel.title + description; ProductSpecificationModel.attributeName simplified. Drop `getLocalizedName`, `getLocalizedTitle`, `getLocalizedDescription`, `parseTranslatable`.
- `features/promotions/data/models/promotion_model.dart` — PromotionProduct.title; PromotionModel.title + description. Drop `getLocalizedTitle` x2, `getLocalizedDescription`, `parseTranslatable`.
- `features/orders/data/models/order_model.dart` — OrderItemModel.productTitle: Map → String. Drop `getLocalizedTitle`, `parseTranslatable`. Inline nested-product fallback as `.toString()`.

**Call sites updated (8 files, ~15 sites)**: home_screen, products_list_screen, product_detail_screen (4 calls), category_selector (4 calls), dynamic_attribute_field, create_promotion_screen (bilingual form removal + Map-building drop), promotion_card, order_detail_screen (`item.title` → `item.productTitle`), seller_reviews_screen, product_form_screen.

Unused `locale` / `l10n` locals removed from 5 sites.

**Verification**:
- `flutter analyze` (seller-mobile): 32 pre-existing `deprecated_member_use` + `use_build_context_synchronously` infos. Zero errors, zero warnings from this refactor.
- CI: lint, type-check, API e2e, both Flutter analyses, all docker-build-check stages — all green
- Net diff: -208 / +47 lines across 14 files

**Ship cycle**: PR #123 → develop ✓ → PR #124 → main ✓ → deploy `26175543769` succeeded → back-merge main → develop ✓. Web prod unaffected (no web files changed); next mobile APK build picks up the simplifications.

### Initiative — Seller-platform cleanup (2026-05-20, PR #120 → #121)

### Initiative — Seller-platform cleanup (2026-05-20, PR #120 → #121)

**Brief**: Full review of seller-web + seller-mobile against the May 2026 platform changes (messaging removal, COD-only buyer payments, monolingual French, jsonb→text). Audit-first; targeted fixes. Profile management deferred as its own initiative.

**Audit method**: Two parallel Explore subagents (one per surface), then cross-platform drift synthesis. Found 5 confirmed bugs and 1 dead-types pile.

**Bugs fixed (all silent in prod until now)**:

1. **seller-web `/dashboard` stat cards always 0** — read `res.data.meta.total` but API returns `data.pagination.total`. All 4 cards (Total / Active / Pending / Drafts) silently rendered 0 even when sellers had products. Plus `loadReviewStats()` read `res.data.products` instead of `res.data.data` (rating calc always returned 0/0). Plus dead `/v1/messages/unread-count` API call + dead `/dashboard/messages` link (both gone since the 2026-05-17 messaging removal).

2. **seller-web `/dashboard/earnings` lists silently empty** — `/sellers/earnings` and `/sellers/payouts` endpoints flatten their envelope to `{ success, data: [...], meta: {...} }` (see payouts.controller.ts:88,118) instead of the canonical nested shape. The page was reading `res.data.earnings`/`payouts` and `res.data.meta` — both wrong. Tabs silently showed "Aucun gain" / "Aucun virement" for everyone.

3. **seller-mobile `orders_repository.dart:46`** — `data['meta']` → `data['pagination']`. Same bug pattern as the products fix in PR #108.

4. **seller-mobile `product_form_screen.dart`** — form still had `_titleEnController` + `_descriptionEnController` and submitted `{ fr, en }` Map to a DTO that expects plain `string`. Any submit would fail validation. Fix: drop EN fields + their dispose() + the modal sections + the Map building in the submit handler.

5. **MM payout request UI hidden (web + mobile)** — per user decision. Wallet balance + earnings + past-payouts list remain visible. Backend (POST `/v1/sellers/payouts` + historical methods) untouched — trivial UI-only re-enable. New `payoutTemporarilyUnavailable` translation key on both surfaces. seller-mobile's `request_payout_screen.dart` collapsed from 276 lines to a 50-line "info" screen (deep-link safe).

**Staleness removed**: `Conversation`, `Message`, `MobileMoneyProvider` types from `seller-web/lib/types.ts`. Inline `PAYOUT_METHOD_LABELS` lookup replaces the `MobileMoneyProvider` enum-based one for displaying historical payouts.

**Verification**:
- `pnpm --filter {api,seller-web} type-check`: clean
- `pnpm --filter api test:e2e`: 90/90 passing
- `flutter analyze` (seller-mobile): 14 pre-existing `deprecated_member_use` + `use_build_context_synchronously` infos; zero errors/warnings from this refactor
- CI: lint, type-check, API e2e, both Flutter analyses, all docker-build-check stages — all green
- Prod smoke: `seller.teka.cd/dashboard` → 307 (auth redirect, route working); `/v1/messages/unread-count` → 401 (endpoint deleted, auth wall behind it)

**Out of scope (flagged for future PRs)**:
- **Profile management** still missing on web + mobile (separate initiative, multi-PR scope)
- seller-mobile models still use the `Map<String, dynamic>` + `getLocalizedTitle/Description(locale)` pattern (product, category, attribute, promotion). buyer-mobile got the equivalent cleanup in PR #117; seller-mobile is a separate follow-up. The defensive `parseTranslatable` makes them tolerate plain-string API responses so they keep working.

**Ship cycle**: PR #120 → develop ✓ → PR #121 → main ✓ → deploy `26173659447` succeeded → back-merge main → develop ✓.

### Initiative — Flutter buyer-mobile multilingual cleanup (2026-05-20, PR #117 → #118)

### Initiative — Flutter buyer-mobile multilingual cleanup (2026-05-20, PR #117 → #118)

**Brief**: Post-migration cleanup. After the jsonb→text DB migration (PR #111 → #112), the API serves plain French strings for every translatable field. The defensive `{ 'fr': value }` Map wrapping in the Flutter buyer-mobile models was protecting against a shape the API no longer returns — pure dead weight.

**Models simplified (10 — audit identified 2, found 8 more during the work)**:
- `catalog/product_model.dart` — BrowseProductModel.title, ProductDetailModel.title/description, ProductCategory.name, BreadcrumbItem.name
- `catalog/category_model.dart` — CategoryModel.name
- `home/banner_model.dart` — title, subtitle
- `home/flash_deal_model.dart` — FlashDealProduct.title + FlashDealModel.title
- `content/content_page_model.dart` — title, content (both classes)
- `cart/cart_model.dart` — CartItemProduct.title
- `orders/order_model.dart` — OrderItemModel.productTitle
- `wishlist/wishlist_model.dart` — WishlistProductModel.title
- `city/city_model.dart` — CityModel.name (audit missed)
- `city/commune_model.dart` — CommuneModel.name (audit missed)

Each dropped: `Map<String, ...>` typed field → `String?`/`String`; `is Map ? Map.from(...) : { 'fr': value }` parsing branch → `json[k]?.toString()`; `localized*(locale)` / `getLocalizedName(locale)` helper; private `_parseTranslationMap` where present.

**Call sites updated (12 files)**: product_card, product_detail_screen (3 calls), category_chip, checkout_screen (3 calls — including the form-submit `data.town`/`neighborhood` which were `name['fr']`), banner_carousel, flash_deal_card, content_page_screen (3 calls), order_detail_screen (`item.localizedTitle` → `item.productTitle`), wishlist_screen, home_screen, cart_screen, city_selection_screen.

Unused `locale` local variables were removed (cart_screen, product_detail_screen, content_page_screen, category_chip, flash_deal_card, home_screen, checkout_screen inner widget). `CartItemTile` no longer takes a `locale` constructor argument.

**Verification**:
- `flutter analyze` (buyer-mobile): zero errors, zero warnings from this refactor (18 pre-existing `deprecated_member_use` infos remain — `withOpacity`/`groupValue` etc, unrelated)
- CI: lint, type-check, API e2e 90/90, both Flutter analyses, all 4 docker-build-check stages — all green
- Net diff: -251 / +57 lines across 23 files

**Ship cycle**: PR #117 → develop ✓ → PR #118 → main ✓ → deploy `26139068828` succeeded → back-merge main → develop ✓. Web prod unaffected (no web files changed); next mobile APK build picks up the changes — distribution is manual via Play Store / direct download, not part of the web deploy pipeline.

### Initiative — Admin user-management split (2026-05-19, PR #114 → #115)

### Initiative — Admin user-management split (2026-05-19, PR #114 → #115)

**Brief**: From the larger admin audit, replace the muddled `Utilisateurs` (mixed BUYER+SELLER+ADMIN) and broken `Vendeurs` (was an application queue, called 404'd endpoints, never actually worked) with 3 clean role-scoped pages.

**New surfaces**:
- `/dashboard/buyers` — BUYER list with status filter (Actifs / Suspendus / Bannis), search by name/email/phone.
- `/dashboard/sellers` (rewritten) — SELLER list joining `sellerProfile`. Dual status columns: KYC `applicationStatus` (PENDING / APPROVED / REJECTED) + account `status` (ACTIVE / SUSPENDED / BANNED). Filter tabs: Tous / En attente / Approuvés / Rejetés / Suspendus. Inline Approve / Reject buttons (with reason modal) on PENDING rows, calling the correct `PATCH /v1/admin/sellers/applications/:applicationId` endpoint.
- `/dashboard/admins` — ADMIN read-only list with last-login column.

**API change**: `admin-users.service.findAllUsers` now selects `sellerProfile { id, businessName, applicationStatus, rejectionReason }`. Null for non-SELLER users. Backward compatible.

**Bonus bug fix uncovered during the work**: the old `/dashboard/sellers` page was calling `/v1/admin/sellers?status=` (404 — controller only exposes `/v1/admin/sellers/applications`) and the Approve/Reject buttons called phantom `/v1/admin/sellers/:id/approve` POST endpoints. The seller-approval workflow had been completely broken; the rewrite is the first version that actually works.

**Routes**:
- New: `/dashboard/{buyers,sellers,admins}` (sellers URL repurposed)
- Removed: `/dashboard/users` (file deleted)
- Redirect: `next.config.ts` adds 308 from `/dashboard/users → /dashboard/buyers`
- Sidebar: replaces 2 entries with 3 (Acheteurs / Vendeurs / Administrateurs)
- `messages/fr.json`: new `Buyers` and `Admins` namespaces; rewritten `Sellers` namespace

**Verification**:
- `pnpm --filter {api,admin-web} type-check`: clean
- `pnpm --filter api test:e2e`: 90/90 passing
- Local Docker smoke against dev DB (1 buyer, 2 sellers, 1 admin):
  - /buyers: Jean Mulamba (Actif) visible
  - /sellers: both sellers with correct dual-status; Marie's pending application approved end-to-end (PATCH succeeded, row updated to "Approuvé", buttons disappeared, page refreshed)
  - /admins: Admin Teka (Actif, last-login today)
  - /users → /buyers 308 redirect verified
- Prod smoke after deploy: all 3 new routes return 307 (auth redirect to login — route exists, middleware protects correctly); /users returns 308 (redirect rule active).

**Ship cycle**: PR #114 → develop ✓ → PR #115 → main ✓ → deploy `26123825619` succeeded → back-merge main → develop ✓.

### Initiative — jsonb→text migration for monolingual French (2026-05-19, PR #111 → #112)

### Initiative — jsonb→text migration for monolingual French (2026-05-19, PR #111 → #112)

**Brief**: After PR #108/#109 fixed the empty product lists, dev admin UI was rendering product titles + category names as raw `{"en":"...","fr":"..."}` JSON. User asked to fully strip multilingual support from the data layer.

**Root cause** (investigation went deeper than the original brief): the May 2026 monolingual refactor updated the Prisma schema to declare 12 translatable columns as `String`, but **no ALTER TABLE was run on the dev DB**. The Postgres columns were still `jsonb` holding `{en, fr}` objects. Prisma's client silently stringifies JSONB on read when the schema declares String — which is why every translatable field rendered as raw JSON.

Verified via `information_schema` on dev DB — 12 columns affected:
- `products.{title, description}`
- `categories.{name, description}`
- `cities.name`, `communes.name`
- `banners.{title, subtitle}`
- `promotions.{title, description}`
- `content_pages.{title, content}`

**Fix** — one-shot migration script at `apps/api/prisma/scripts/migrate-jsonb-to-text.ts`:

```sql
ALTER TABLE <t>
ALTER COLUMN <c> TYPE text
USING COALESCE(<c>->>'fr', <c>->>'en', <c>::text)
```

- Atomic per-column (data conversion + type change in one statement)
- Idempotent (skips columns already `text`)
- COALESCE preserves data for any malformed rows (.fr → .en → raw JSONB text fallback)

**Verification — dev DB**: all 12 columns migrated `jsonb → text`. Sample data: `products.title = "Tecno Spark 10 Pro - 128Go"` (plain, not JSON). Browser smoke on admin /Produits + seller /Mes Produits — every title, category, city renders as plain French. No JSON visible.

**Verification — prod DB**: ran the same script; **all 12 columns reported "already text, skipping"**. Prod had been migrated at some earlier point (likely an earlier `prisma db push` that ran the ALTER when the schema was first changed, OR a manual migration). The user-visible JSON-rendering issue was dev-only — prod has been correct all along. Script committed as a safety net + documentation against future drift.

**Ship cycle**: PR #111 → develop ✓ → PR #112 → main ✓ → deploy `26119949796` succeeded → back-merge main→develop ✓ → prod migration ran idempotently (all skipped). User confirmed products visible on prod admin Produits.

**Out of scope (deferred)**:
- Flutter mobile model defensive parsing — `buyer-mobile/lib/features/catalog/data/models/{product,category}_model.dart` wrap incoming `title`/`name` strings in `{ 'fr': value }` maps. Tolerates plain strings, so functionally fine; simplification to plain `String` is a separate cleanup PR.

### Initiative — Product list empty bugs (2026-05-19, PR #108 → #109)

### Initiative — Product list empty bugs (2026-05-19, PR #108 → #109)

**Brief**: Two reported bugs — admin "Produits" menu shows empty list despite products in DB; seller "Mes produits" shows empty list. Larger brief also requested user-management refactor + profile management systems (deferred — out of scope for this PR per user sign-off).

**Diagnosis** (read-only Explore subagent + direct code reading + dev DB queries):

**Bug 1 — admin /produits empty**
- Root cause: `apps/api/src/admin/admin-products.service.ts:23` hardcoded `where: { status: ProductStatus.PENDING_REVIEW }`. Page was effectively a moderation queue mislabeled "Produits".
- Dev DB had 24 products (16 ACTIVE, 3 PENDING_REVIEW, 3 DRAFT, 1 REJECTED, 1 ARCHIVED) — only 3 visible to admin even though all 24 exist.

**Bug 2 — seller /mes-produits empty**
- Root cause: pure response-shape mismatch.
- API at `products.service.ts:findSellerProducts` returns `{ data: [...], pagination: {...} }` (the canonical shape used everywhere else in the codebase).
- seller-web at `dashboard/products/page.tsx:64-65` read `res.data.products` + `res.data.meta` — both keys are undefined → `setProducts(undefined || [])` always empty.
- seller-mobile at `products_repository.dart:48-50` correctly read `data['data']` for items but `data['meta']` for pagination (pagination defaulted to zeros on mobile but items rendered).

**Fix** (per user sign-off — all 3 questions): Full list + status filter; fix frontends to match API; ship just these two bugs.

API:
- `admin-products.service.ts`: `findPendingProducts(page, limit)` → `findProducts(page, limit, status?)`. When `status` omitted, returns all statuses. Status whitelisted against `ProductStatus` enum (invalid value falls back to all — no SQL injection).
- `admin-products.controller.ts` @Get() handler exposes `?status=` query param.

admin-web:
- Status filter tabs: Tous / En attente / Actifs / Rejetés / Archivés / Brouillons
- Status badge renders all 6 ProductStatus values (was only APPROVED/REJECTED/pending)
- Approve/Reject buttons remain gated to PENDING_REVIEW rows (existing service logic unchanged)
- Response-shape parity: read `pagination` not `meta`
- 6 new FR translation keys

seller-web:
- `seller-web/.../products/page.tsx`: read `res.data.data` + `res.data.pagination`. Update `ProductsResponse` type.

seller-mobile:
- `products_repository.dart`: read `data['pagination']`.

**Verification** (local Docker, dev DB):
- `pnpm --filter {api,admin-web,seller-web} type-check`: clean
- `pnpm --filter api test:e2e`: 90/90 passing
- `flutter analyze` (seller-mobile): no new warnings
- Browser smoke (admin@teka.cd ADMIN + marie@shop.cd SELLER, with temporary COOKIE_DOMAIN= override for localhost):
  - Admin /Produits: 24 listed; "En attente" → 3; "Actifs" → 16; "Rejetés" → 1; "Brouillons" → 3; "Archivés" → 1
  - Approve/Reject buttons gate to PENDING_REVIEW only
  - Seller (Marie) /Mes Produits: all 11 of her products listed across all statuses with correct prices and actions

**Ship cycle**: PR #108 → develop ✓ → PR #109 → main ✓ → deploy `26117131092` succeeded → back-merge main→develop ✓. Prod smoke: admin.teka.cd/login + seller.teka.cd/login → 200; api.teka.cd /admin/products + /sellers/products → 401 (auth working).

**Out of scope (flagged for follow-up)**:
- Product titles render as `{"en":"...","fr":"..."}` JSON strings (seed-data shape from before the May 2026 monolingual refactor). Pre-existing — affects buyer-web SEO too. Separate cleanup PR.
- Larger architecture asks from the brief (user-management refactor into Buyers/Sellers/Admins split; profile management systems for buyer+seller+admin). Each is multi-PR scope; needs separate plan.

### Initiative — Admin dashboard audit + sync (2026-05-18, PR #105 → #106)

### Initiative — Admin dashboard audit + sync (2026-05-18, PR #105 → #106)

**Brief**: Full review/sync/validation of admin dashboard after the May 12-18 platform refactors (buyer WhatsApp OTP, phone-OTP removal, monolingual FR-only, Google OAuth removal, seller SMS-migration cleanup). Browser-test locally with Docker. Modify only what's necessary.

**Audit method**: Read-only Explore subagent mapped all admin-web pages, endpoints, auth flow, and grepped for stale references to removed surfaces.

**Confirmed issues (3 — all type-definition drift)**:
1. `User.phone` is `String?` since 2026-05-12 but admin-web typed it as `string` in 6 places (auth-store + 5 dashboard pages). Email-only buyer cohort (2026-05-12 → 2026-05-15) has null phone until they complete /reclamer-compte; admin previously rendered a blank cell.
2. `User.locale` was dropped during the May monolingual collapse but the type still declared it on all 3 web apps' auth stores (admin-web, seller-web, buyer-web).
3. Cross-platform parity: also fixed `locale` field in seller-web + buyer-web auth stores (buyer-web `phone` was already correct).

**Changes**:
- `apps/admin-web/src/lib/auth-store.ts`: phone → nullable, drop locale
- `apps/admin-web/src/app/dashboard/{users,sellers,orders,orders/[id],products/[id]}/page.tsx`: phone interfaces → nullable, render `?? '—'` fallbacks
- `apps/{buyer,seller}-web/src/lib/auth-store.ts`: drop stale locale field
- 8 files, +14/-17. No runtime behavior change beyond rendering `—` instead of blank cells.

**Audit findings — CLEAN (no fix needed)**:
- Auth middleware accepts access OR refresh token (parity with seller-web after PR #95→#97)
- Login: email-only, no phone tab, no Google OAuth, no `/migrate` link
- Dashboard role gate logs out non-ADMIN users (PR #100 → #101 still working)
- `apiFetch` has hasSessionHint + coalesced refresh-on-401 (parity)
- Zero references to removed surfaces: Conversation/Message, seller migration endpoints, Google OAuth, `[locale]` routing, Mobile Money UI
- Cloudinary lifecycle handled API-side; admin delete doesn't need extra
- Stats queries don't reference dropped models

**Verification**:
- `pnpm --filter {admin,seller,buyer}-web type-check`: clean
- `pnpm --filter admin-web build`: clean
- Local Docker rebuild + smoke on `/admin/login`: email-only form renders, no console errors, middleware correctly redirects `/dashboard/*` → `/login?redirect=...` for unauthenticated users
- CI green on both #105 and #106 (lint, type-check, API e2e 90/90, both Flutter analyses, all 4 docker-build-check stages)
- Local dev DB at `postgresql-congofoot.alwaysdata.net` was unreachable during smoke — blocked post-login browser walk-through; CI build pipeline + the trivial-safety of the diff (pure type-level + render guards) substituted for that

**Ship cycle**: PR #105 → develop ✓ → PR #106 → main ✓ → deploy `26055805939` succeeded (1m13s) → back-merge main→develop ✓. Prod smoke: `https://admin.teka.cd/login` returns 200.

### Initiative — Seller auth cleanup + platform-seller email migration (2026-05-18, branch feat/seller-auth-cleanup-migration)

### Initiative — Seller auth cleanup + platform-seller email migration (2026-05-18, branch feat/seller-auth-cleanup-migration)

**Brief**: Sellers must authenticate ONLY via email + password. Remove all remaining legacy SMS-based seller authentication code. Migrate the "Teka RDC Officiel" platform seller account to `ipanga@outlook.fr` without disturbing historical data (orders, product ownership, audit trails). Must NOT touch buyer WhatsApp OTP flow.

**Scope of removal (API)**:
- `apps/api/src/auth/auth.controller.ts` — dropped `sellerMigrateCheck`, `sellerMigrateLinkEmail`, `sellerSetupPassword` handlers + DTO imports.
- `apps/api/src/auth/auth.service.ts` — dropped `migrateSellerCheck()`, `migrateSellerLinkEmail()`, `setupSellerPassword()`, private `sendSellerSetupLink()`.
- `apps/api/src/auth/dto/seller-{migrate-check,migrate-link-email,password-setup}.dto.ts` — deleted (3 files).
- `SellerMigration` Prisma model **kept** (historical rows / audit). `AuthProvider` enum keeps `PHONE_OTP` (buyer WhatsApp OTP path still uses it).

**Scope of removal (seller-web)**:
- `apps/seller-web/src/app/migrate/` + `apps/seller-web/src/app/setup-password/` — deleted.
- `apps/seller-web/src/app/login/page.tsx` — removed the `/migrate` link (forgot-password stays).

**Scope of removal (seller-mobile)**:
- `apps/seller-mobile/lib/features/auth/presentation/screens/{migrate,setup_password}_screen.dart` — deleted (2 files).
- `apps/seller-mobile/lib/features/auth/data/auth_repository.dart` — dropped `migrateSellerCheck`, `migrateSellerLinkEmail`, `setupSellerPassword`, `requestOtp`.
- `apps/seller-mobile/lib/features/auth/presentation/providers/auth_provider.dart` — dropped matching provider methods.
- `apps/seller-mobile/lib/core/router/app_router.dart` — dropped `/auth/migrate` + `/auth/setup-password` routes.

**Platform-seller migration (declarative, via seed.ts)**:
- `apps/api/prisma/seed.ts:seedTekaOfficielSeller()` — constants `TEKA_OFFICIEL_SELLER_EMAIL='ipanga@outlook.fr'` + `TEKA_OFFICIEL_DEV_PASSWORD='TekaDev2026!'`. Dynamic `bcrypt` import + `bcrypt.hash(password, 10)` runs once per seed. Upsert now writes `email`, `authProvider='EMAIL_PASSWORD'`, `emailVerified=true`, `passwordHash`, `passwordSetAt=new Date()` on BOTH create AND update branches (previous `update: {}` would not have migrated an existing row).
- Phone field (`+243800000000`) preserved — required for delivery contact + retains uniqueness with historical rows. UserId `10000000-0000-0000-0000-000000999999` unchanged → SellerProfile, Product ownership, and Order references all untouched.

**Verification**:
- `pnpm --filter api type-check` — clean
- `pnpm --filter seller-web type-check` — clean
- `pnpm --filter api test:e2e` — 90/90 passing (no test referenced the dropped endpoints)
- Flutter analyze (seller-mobile) — clean

**Prod data migration** (seed does not run on prod): provide the user with one-off SQL after merge to:
1. Update the existing `users` row (`id = '10000000-0000-0000-0000-000000999999'`) to set `email='ipanga@outlook.fr'`, `authProvider='EMAIL_PASSWORD'`, `emailVerified=true`, `passwordHash=<bcrypt('TekaDev2026!', 10)>`, `passwordSetAt=NOW()`.
2. Trigger `/v1/auth/password-reset/request` for ipanga@outlook.fr to rotate to a real password via the standard reset flow.

**Out of scope (intentional)**:
- `SellerMigration` Prisma model retained (historical reference).
- `email.service.ts:sendSellerSetupEmail` method retained (no callers, but harmless dead method — leave for next janitorial sweep).
- `PHONE_OTP` enum value retained (buyer WhatsApp OTP creates these records).

### Hotfix — admin/seller /login bypass via cross-subdomain cookies (2026-05-17, PR #100 → #101)

**Symptom**: Clicking the "Connexion / Login" button on `admin.teka.cd` or `seller.teka.cd` opened the dashboard directly instead of showing the login form. Buyers who'd logged into teka.cd were silently landing on broken admin/seller dashboards.

**Root cause** (regression from interactions between today's earlier work):
- PR #95 (earlier today) added refresh-token fallback to seller-web + admin-web middleware (so 15-min access token expiry doesn't kick people out)
- The COOKIE_DOMAIN=.teka.cd infra fix (also earlier today) made cookies cross-subdomain-visible
- Combined: buyer cookies on .teka.cd satisfied the middleware's `hasSession` check on seller.teka.cd / admin.teka.cd → triggered the `if (isAuthOnly && hasSession) → /dashboard` redirect
- Dashboard layouts didn't check role, so wrong-role users briefly saw the dashboard chrome before APIs started 403'ing

**Fix** (4 files, defense in depth):
- `apps/{seller,admin}-web/src/middleware.ts` — removed the authOnly `/login → /dashboard` redirect. The login form renders unconditionally; `/dashboard` protection (redirect to /login when no cookie) unchanged.
- `apps/{seller,admin}-web/src/app/dashboard/layout.tsx` — wait for `/me`, then verify `user.role === 'SELLER'` (or `'ADMIN'`). Wrong role → `logout()` (clears wrong-role cookies) → `router.replace('/login')`. Spinner shown until check passes; never flashes dashboard for a wrong-role user.

**Ship cycle**: PR #100 → PR #101 → main → deploy run 25997178223 succeeded. Back-merged main → develop.

**Prod smoke verified**:
- `admin.teka.cd/login`: login form renders even with `teka_session=1` hint cookie present ✓
- `seller.teka.cd/login`: login form renders ✓

**Out of scope** (called out for posterity):
- Adding a per-role cookie at login (e.g. `teka_role=ADMIN`) would let the middleware do the role gate at the edge. Cleaner architecturally, but new contract across API + 3 web apps. Client-side gate is smaller and equally effective for this surface area.

### Previous initiative — Payment simplification + messaging removal + auth parity (2026-05-17, 4 PRs)

### Initiative — Payment simplification + messaging removal + auth parity (2026-05-17, 4 PRs)

**Audit-first discovery**: brief mentioned three threads — payment simplification, messaging removal, auth persistence. Parallel research agents confirmed: actual payment-method UI surfaces are ONLY 2 (buyer-web + buyer-mobile checkout); messaging surfaces span 5 apps + API + Prisma; reported "users still get logged out" issue applies to seller-web + admin-web, not buyer-web (which was fixed earlier today). Plan: 3 PRs shipped in priority order.

**PR A (#95→#97) — Auth parity for seller-web + admin-web**
- `apps/{seller,admin}-web/src/lib/api-client.ts` — full apiFetch port from buyer-web with hasSessionHint + tryRefresh coalesced refresh-on-401 + loop guard
- `apps/{seller,admin}-web/src/middleware.ts` — accept either teka_access_token OR teka_refresh_token (was access-only)
- Mobile already had the equivalent dio interceptor (verified in audit) — no parity work needed
- Without this, sellers and admins were getting silently logged out 15 min after login. Actual cause of the user's persistent logout reports across non-buyer surfaces.

**PR B (#96, shipped via #99) — Hide Mobile Money UI in checkout**
- `apps/buyer-web/src/app/checkout/page.tsx` — `ENABLE_MOBILE_MONEY = false` constant gates MM PaymentTile + provider sub-card + payer phone field
- `apps/buyer-mobile/lib/features/checkout/presentation/screens/checkout_screen.dart` — `_enableMobileMoney = false` gates MM _PaymentOption + provider tiles + phone TextField
- Backend untouched: PaymentProvider interface + Flexpay + COD + factory + DTO + service branching all preserved. Re-enable is a one-line flip of both constants.
- Historical orders with `paymentMethod: 'MOBILE_MONEY'` still display correctly on seller + admin order pages (display logic was already enum-aware).

**PR C (#98, shipped via #99) — Retire direct buyer↔seller messaging**
- API (`apps/api/src/messaging/messaging.controller.ts`): all 5 endpoints throw 410 GONE with `code: 'MESSAGING_REMOVED'` + French message. MessagingService implementation, Prisma `Conversation` + `Message` models, all DB rows, 3 User relations preserved untouched — historical data stays readable for audit + support.
- buyer-web: deleted `app/messages/`, removed header icons + unread polling, dropped `/messages` from middleware protectedRoutes, replaced PDP "Contacter le vendeur" with `<Link href="/contact">Contacter le support Teka RDC</Link>`
- seller-web: deleted `app/dashboard/messages/`, removed sidebar Messages nav + polling
- buyer-mobile + seller-mobile: deleted `lib/features/messaging/`, dropped `/messages` routes from app_router.dart, removed appbar Messages icons + cards. buyer-mobile PDP shows non-actionable Container("Pour toute question, contactez le support Teka RDC.") with support_agent icon.
- Translation keys preserved with `_DEPRECATED_2026-05-17` marker for audit. New keys: `Support.contactSupport` (web) + `contactSupport` (Flutter buyer-mobile l10n, regenerated via `flutter gen-l10n`).
- Net diff: 33 files, +153 / -3970 lines.

**Ship cycle**: PR #95 → PR #97 → main → deploy ✓. PR #96 + PR #98 → develop in parallel → combined PR #99 → main → deploy ✓. Back-merges main → develop after each release.

**Prod smoke verified**:
- PDP shows "Contacter le support Teka RDC" linking to `/contact` ✓
- Header has zero `/messages` links ✓
- Messaging API endpoints return 401 (auth-gated) — would return 410 GONE for authenticated stale clients
- buyer-web + seller-web + api.teka.cd all return 200

**Still requires real-user verification** (needs authenticated session):
- buyer-web checkout shows only COD tile (verified at code/type-check level)
- buyer-mobile checkout same
- seller.teka.cd login → 16+ min idle → navigate (PR A's actual purpose)

**Explicitly preserved** (per "do not remove anything still needed for audits / re-enable"):
- All backend payment provider abstraction
- All Prisma models, DB rows, User relations
- All `MessagingService` code
- All Messaging.* translation keys with deprecation markers
- Notifications + SMS broadcasts (already isolated — no coupling per audit)

### Previous initiative — Cloudinary media lifecycle + client compression (2026-05-17)

**Scope discovery**: Audit revealed actual upload surface is much smaller than the brief suggested. Only TWO file-upload entry points exist across the whole stack:
1. `seller-web/src/components/product/image-uploader.tsx` → `POST /v1/sellers/products/:id/images`
2. `seller-mobile/lib/features/products/.../product_images_screen.dart` → same endpoint

Buyer-web/buyer-mobile have no avatar upload UI. Admin banner page accepts URL paste only (no `cloudinaryId` stored). `SellerProfile` has no logo field. So the work focused on the product image lifecycle where real uploads happen.

**PR A — Server-side lifecycle (PR #89, released via #90)**:
- `CloudinaryService.deleteImages(ids[])` bulk helper — wraps `delete_resources` in 100-id chunks, logs partial failures but never throws (orphan assets are a cost issue, not correctness; failing the caller's DB delete would be worse).
- New `DELETE /v1/sellers/products/:id/hard` endpoint — `/hard` suffix makes destructive intent obvious at the call site. Owner-scoped. Collects all image cloudinaryIds, deletes the Product row (FK cascade removes ProductImage rows), then bulk-destroys Cloudinary. DB-first ordering so a Cloudinary blip can't roll back the local delete.
- Existing soft-archive flow (`DELETE /v1/sellers/products/:id`) UNCHANGED: per locked decision, archive stays reversible (images kept), only hard-delete purges.
- Safe for order history: `OrderItem` snapshots title + image URL at order time.
- Thumbnail URL template: `f_webp` → `f_auto,q_auto`. Cloudinary now serves AVIF/WebP/JPEG based on requester's Accept header.
- Upload MIME guard: JPEG/PNG/WebP/GIF only on `POST /v1/sellers/products/:id/images`. 5 MB ceiling kept as defence-in-depth.
- e2e: 90/90 pass (5 new auth-guard tests for hard-delete and existing routes).

**PR B — Client compression (PR #91, released via #92)**:
- seller-web: `browser-image-compression` (~6 KB gzipped). `lib/image-compress.ts` wraps the library with `compressImageForUpload(file)` → ≤500 KB WebP (skips GIF + already-small files). Fail-safe: returns original on any error.
- seller-mobile: `flutter_image_compress ^2.3.0`. `lib/core/utils/image_compress.dart` mirrors web helper. Returns `CompressedImage { bytes, filename, mimeType }` so dio MultipartFile gets the right `.webp` extension. `ProductsRepository.uploadImage` switched to `MultipartFile.fromBytes`.
- Cleanup bundled in: stale `app_localizations_en.dart` removed (leftover from May 2026 monolingual refactor — pub get noticed the EN .arb was gone).

**Explicit non-goals (called out in PR bodies)**:
- Avatar upload UI on buyer-web / buyer-mobile (none exists today)
- Seller logo upload (no `SellerProfile.logo` field exists)
- Banner image cleanup (admin pastes URL, no `cloudinaryId` stored — needs schema migration)
- Soft-delete user → cascade-purge products' Cloudinary (would break order history thumbnails)

**Prod smoke (post-deploy)**:
- seller.teka.cd loads cleanly (compression dep didn't break the build)
- `DELETE /v1/sellers/products/:id/hard` returns 401 unauthenticated (route exists, auth-guarded)
- `api.teka.cd/api/v1/browse/products?limit=1` returns 200 with `image: { url, thumbnailUrl }` shape using the new `f_auto,q_auto` template

**Awaiting real-seller verification**:
- seller-web: drop a 3+ MB JPEG → confirm devtools shows ≤500 KB compressed `.webp` payload uploaded
- seller-mobile: pick a fresh camera photo → confirm dio request body weight matches compressed size
- Hard-delete: invoke from a seller account, confirm Cloudinary asset is destroyed (via Cloudinary console)

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

## Profile Management Initiative (2026-05-20 → 2026-05-21)

Two-phase user-facing surface for self-service account management on all 5 frontends. Both phases shipped via real `develop → main` merges (no squash) and live-validated in production.

### Phase 7a — Notification Preferences (PRs #138, #139)

- [x] **7a-A1** — Prisma: `User.notificationPrefs JSONB?` (nullable; default behavior is opt-in)
- [x] **7a-A2** — DTO + service: `NotificationPrefsDto` (smsOrderUpdates, smsBroadcasts), `NotificationPrefsService.resolve / update / shouldSendOrderUpdates / shouldSendBroadcasts`
- [x] **7a-A3** — Controller: `GET /v1/users/notification-prefs`, `PATCH /v1/users/notification-prefs`
- [x] **7a-A4** — Enforcement: 6 SMS sites in `order-notification.service.ts` + the broadcast loop in `broadcasts.service.ts` now gate on `shouldSend*(userId)`
- [x] **7a-A5** — Manual SQL migration applied to prod: `apps/api/prisma/migrations/manual/2026-05-20_user_notification_prefs.sql`
- [x] **7a-W1..W3** — "Notifications" card on `/profil` (buyer-web), `/dashboard/profile` (seller-web, admin-web) with 2 switches + auto-save + optimistic toggle
- [x] **7a-M1..M2** — Same card on `profile_screen.dart` (buyer-mobile, seller-mobile) with l10n keys regenerated via `flutter gen-l10n`

### Phase 7b — Session Management (PRs #140, #141)

- [x] **7b-A1** — `JwtStrategy.validate` returns `jti` so `@CurrentUser('jti')` works
- [x] **7b-A2** — `generateTokens` + `generateTokensForUser` accept optional `{ userAgent, ipAddress }`; persisted to `RefreshToken.deviceInfo` (cap 500 chars) + `ipAddress`
- [x] **7b-A3** — Plumbed `device` through all 5 callers: loginWithEmail, registerWithEmailForRole, refreshTokens, buyerOtpService.verifyOtp, buyerClaimService.verifyClaim
- [x] **7b-A4** — Controllers add `@Req() req: Request` + `extractDevice()` helper (User-Agent + `req.ip`)
- [x] **7b-A5** — `SessionsService` + 3 endpoints under `/v1/users`:
  - `GET /sessions` (active rows only, current flagged)
  - `DELETE /sessions/:id` (refuses self; 404 cross-account)
  - `DELETE /sessions` (revoke all except current)
- [x] **7b-W1..W3** — "Appareils connectés" card on all 3 web profile pages (list + per-row Déconnecter + bulk "Déconnecter les autres appareils")
- [x] **7b-M1..M2** — `_SessionsCard` widget on both mobile profile screens (mirrors web parity)
- [x] **7b-V1** — 90/90 e2e green; type-check + flutter analyze clean on all 5 frontends
- [x] **7b-V2** — Production smoke validated: list / per-row revoke / bulk revoke all behave as designed

### Follow-up — Real Client IP (PRs #142, #143)

Phase 7b smoke surfaced `RefreshToken.ipAddress` was rendering as `::ffff:172.18.0.6` (nginx's internal docker IP). Express's `req.ip` returns the socket address unless the app opts into `trust proxy`.

- [x] **F1** — `apps/api/src/main.ts`: `app.getHttpAdapter().getInstance().set('trust proxy', 1)` to trust the single nginx hop
- [x] **F2** — No backfill: existing rows roll off naturally on the 7d refresh-token TTL
- [x] **F3** — Verified post-deploy: fresh login on seller.teka.cd showed real public IP `197.250.153.149` (was previously `::ffff:172.18.0.6`)

### Test coverage

- API e2e: 90/90 green (was 71 pre-initiative, +19 incremental coverage across the initiative)
- Web type-check: clean on all 3 apps
- Flutter analyze: 0 errors on both mobile apps (pre-existing info-level deprecation warnings only)

---

## ALL 8 PHASES COMPLETE

The Teka RDC e-commerce marketplace is feature-complete across all 5 frontends (API, 3 web apps, 2 mobile apps) and production-ready with:
- Full authentication (email + password for sellers/admins; WhatsApp OTP via Gupshup for buyers since 2026-05-15)
- Product catalog with categories, search, filters
- Shopping cart, checkout, order lifecycle
- Mobile Money payments + COD
- Reviews, wishlists, buyer-seller messaging
- Admin dashboard with full platform management
- SEO, PWA, error boundaries, health checks
- Docker production configs, SSL, documentation
- 90 e2e test cases covering critical paths
- Self-service profile management: avatar / personal info / password / notification preferences / active session list (2026-05-20)
