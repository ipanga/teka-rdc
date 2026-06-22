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
- [ ] **P2.1 — Mapper upgrade (both apps, byte-identical per Rule 15).** `dio_error_messages.dart`:
  no-internet / timeout / 5xx / unknown → brief's exact FR; business 4xx with envelope `error.message` →
  return it; never return `.toString()`. Create the seller-mobile copy.
- [ ] **P2.2 — Kill the leaks.** Replace every `error: e.toString()` / raw display (~23 sites) with the
  mapper. Buyer: auth_provider (3), auth screens (otp_request/claim_*), checkout/cart/wishlist/orders/reviews
  providers. Seller: auth_provider (2), the 4 auth screens (remove custom parsing), products/promotions/
  earnings/orders/reviews/notifications providers. Delete the inline `_humanizeError` duplicate in
  `otp_verify_screen.dart`.
- [ ] **P2.3 — Sentry context.** Helper to `captureException` UNEXPECTED errors only (5xx + non-Dio/unknown;
  skip network + business-4xx) with scope: endpoint+method+status, userId, active city, app version, platform.
  Reuse `sentry_scrub`. Both apps.
- [ ] **P2.4 — PostHog auth events.** Add `auth_otp_requested` / `auth_otp_verified` / `auth_login_success` /
  `auth_login_failure` (+ `error_category`, never PII) at the auth steps. Both apps. Preserve `identifyUser`.
- [ ] **P2.5 — Auth UX states.** Shared error-display widget (friendly message + **Réessayer** where
  applicable) + consistent loading/disabled states across buyer + seller auth screens.
- [ ] **P2.6 — Verify.** analyze + tests both apps; manual error cases (offline / timeout / 5xx / bad OTP /
  validation) show friendly FR only; Sentry gets context; PostHog events fire. PR → develop.

## Release
- [ ] Real merge `develop → main` per phase (NEVER squash); back-merge; verify (mobile ships to devices on the
  next Play Store build — web unaffected); tick here + PROGRESS.md.

## Guardrails
No API/DB/migration. Preserve existing authenticated flows, Sentry scrub, PostHog identity (id+role only, no
PII). buyer-mobile ↔ seller-mobile error layer kept identical (Rule 15). Don't bypass the Dio chain.
