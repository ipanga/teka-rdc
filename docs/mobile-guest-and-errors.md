# Mobile Guest Browsing + Enterprise Error Handling — tracker

> **Resume anchor.** Single source of truth for this initiative. On any resume: read this first, then
> `git log --oneline -15`, then continue from the first unchecked `[ ]`. Each phase is its own PR off `develop`.
> STATUS.md points here. **No API/DB changes** (the browse endpoints are already public).

## Root-cause analysis

**Part 1 (guest browsing):** ONE line in `apps/buyer-mobile/lib/core/router/app_router.dart` forces every
guest to login: `if (!isAuth && !isAuthRoute) return '/auth/connexion';`. The rest is already guest-ready —
`/v1/browse/*`, `/v1/cities`, `/v1/banners`, `/v1/flash-deals` are public; `AuthInterceptor` attaches the
token *if present* (doesn't block); `OfflineAwareInterceptor` allows GETs; city selection persists locally
(the profile-sync PATCH no-ops for guests). → **client-gate problem, no backend change.**

**Part 2 (error handling):** the centralized mapper `core/network/dio_error_messages.dart`
(`extractDioErrorMessage`) EXISTS but the auth providers/screens bypass it — they set `error: e.toString()`,
so a raw `DioException [connection timeout]…` reaches the user. ~23 leak sites across both apps;
**seller-mobile has no mapper** (each screen reimplements parsing). The mapper is missing categories
(5xx server, 401 auth, OTP-fail, validation).

## Locked decisions (user, 2026-06-22)
- **Guest cart = gate-on-action.** Tapping add-to-cart / favorite as a guest → save the location → login →
  return to the screen (same login-trigger as checkout). NO local guest cart / merge (server cart stays the
  single source). Re-tap completes the action after login (return-to-screen, not auto-replay).
- **Error message source = prefer API message, friendly generics otherwise.** Network/timeout/5xx/unknown →
  the brief's exact FR strings (client-controlled). Business 4xx (auth/OTP/validation) → the API envelope's
  French message (already contextual). Honors "preserve APIs".

## Phase 1 — Buyer-mobile guest browsing (branch `feat/mobile-guest-browsing`) — CODE-COMPLETE
- [x] **P1.1 — Router.** `app_router.dart`: selective gate — (1) `unknown` → null; (2) **city-first**
  `!hasCity && !isCityRoute` → `/city-selection` (everyone); (3) `!isAuth && isProtectedRoute(loc)` → save
  `returnToRoute` + `/auth/connexion`; (4) `isAuth && isAuthRoute` → consume `returnToRoute` (microtask-clear)
  else `/`. `returnToRouteProvider` + public `isProtectedRoute()` (cart/checkout/orders/wishlist/profile).
- [x] **P1.2 — Auth guard helper.** `core/auth/auth_guard.dart` `ensureAuthenticated` applied at
  `wishlist_button` toggle + `product_card` quick-add + `product_detail_screen` add-to-cart. Removed the
  hard-coded `context.go('/')` from `otp_verify_screen` + `claim_verify_screen` (router consumes returnTo).
- [x] **P1.3 — Guest-safe home.** Wishlist + cart badges and the `loadWishlistIds` listeners only run when
  authenticated (Riverpod lazy-watch → guests never construct the auth-only providers → no 401). Icons still
  route to `/wishlist` `/cart` (router gates guests to login).
- [x] **P1.4 — Verify.** `flutter analyze` 0 errors/warnings; **87 tests** (incl. 3 new
  `test/router/protected_route_test.dart`). **Verified on the prod-flavor app (emulator → api.teka.cd):**
  (1) launch → **city-selection** (guest, NOT login); (2) pick town → full home browse (hero, categories,
  products, prices, images) as a guest; (3) guest browse fires **ZERO auth-only calls / 0 × 401** (only
  `/v1/browse/*` + `/v1/cities`); (4) tapping the wishlist heart (protected) → **WhatsApp OTP login** with a
  back arrow. Two on-device fixes folded in (commit be8c3cf): product-card heart + city-sync no longer call
  auth-only endpoints for guests. PR → develop.

## Phase 2 — Mobile error handling (branch `feat/mobile-error-handling`)
- [x] **P2.1 — Mapper upgrade (both apps, byte-identical per Rule 15).** `dio_error_messages.dart` rewritten:
  no-internet / timeout / 5xx / unknown → the brief's exact FR; business 4xx → API envelope `error.message`
  (prefer-API); never `.toString()`. Added `friendlyErrorMessage(Object)` for any caught error. Created the
  seller-mobile copy. 6 unit tests (`test/network/dio_error_messages_test.dart`).
- [x] **P2.2 — Kill the leaks.** Replaced all ~23 raw-error sites with the mapper. Buyer: auth_provider (3),
  auth screens (otp_request / claim_request / claim_verify → `friendlyErrorMessage`), `otp_verify` (deleted
  the inline `_humanizeError`), checkout/cart/orders/wishlist/reviews providers. Seller: auth_provider (2),
  the 4 auth screens (removed the custom `e.response?.data…` parsing + dropped the now-unused `dio` import),
  products/promotions/earnings/orders/reviews/notifications providers. analyze 0 errors/warnings both apps;
  buyer 87+6 tests, seller 3 tests.
- [x] **P2.3 — Sentry context.** `friendlyErrorMessage` auto-`captureException`s UNEXPECTED errors only
  (5xx + non-Dio/unknown; skips network + business-4xx) with tags endpoint+method / http_status / error_type —
  so all ~23 sites report with one integration. userId (id+role only, no PII) attached on the Sentry scope at
  auth (both apps) + cleared on logout; active town tagged on town-select (buyer). Device/release are
  Sentry-auto; `sentry_scrub` strips phones. Hardened `PosthogAnalytics._enabled` to never throw.
- [x] **P2.4 — PostHog auth events.** `auth_otp_requested` / `auth_otp_request_failed` / `auth_login_success`
  (method otp|email) / `auth_login_failure` (+ `error_category`, never PII) in buyer + seller auth providers;
  added a `capture()` to seller's analytics (it had only identify/reset). `identifyUser` preserved.
- [~] **P2.5 — Auth UX states (baseline).** Friendly multi-line messages render in the existing error boxes;
  loading/disabled states already consistent across auth screens. A shared retry-error widget is a noted
  follow-up (not required — auth screens already expose a re-submit affordance).
- [x] **P2.6 — Verify.** `flutter analyze` 0 errors/warnings both apps; buyer **93** tests (incl. 6 mapper
  category tests), seller **3**. Mapper unit tests prove: no raw `.toString()`, friendly FR per category,
  prefer-API for 4xx. PR → develop.

## Release
- [ ] Real merge `develop → main` per phase (NEVER squash); back-merge; verify (mobile ships to devices on the
  next Play Store build — web unaffected); tick here + PROGRESS.md.

## Guardrails
No API/DB/migration. Preserve existing authenticated flows, Sentry scrub, PostHog identity (id+role only, no
PII). buyer-mobile ↔ seller-mobile error layer kept identical (Rule 15). Don't bypass the Dio chain.
