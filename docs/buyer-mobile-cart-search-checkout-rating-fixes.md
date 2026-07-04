# Buyer-mobile fixes — nav stack, cart bar, search, checkout, town warning, ratings

**Initiative date:** 2026-07-04 · **Branch:** `fix/buyer-mobile-cart-search-checkout-rating` → PR into `develop`

Six defects observed on a real iPhone TestFlight build of buyer-mobile, plus buyer-web parity.
Each was fixed at its source with minimal, backward-compatible changes — no regeneration, no API
breakage, no business-logic changes. French-only UI; currency stays `FC` with `.` separators; COD
only; Teka-managed delivery. The API is the single source of truth, so cross-platform behaviour
was kept consistent and buyer-web SEO was untouched (all web edits are client islands).

## Status checklist

| # | Issue | Status |
|---|---|---|
| 1 | Nav stack lost after login from PDP (no back button) | ✅ Done (mobile) |
| 2 | PDP add-to-cart not Jumia-style (no qty stepper) | ✅ Done (mobile) |
| 3 | Search shows no product/brand suggestions | ✅ Done (mobile) |
| 4 | False "Erreur de validation" on confirm order (P0) | ✅ Done (mobile) |
| 5 | No town-mismatch warning at checkout | ✅ Done (API + web + mobile) |
| 6 | Rating after delivery broken | ✅ Done (API + web + mobile) |
| — | buyer-web parity | ✅ Verified |
| — | Tests (API + Flutter) | ✅ Green |

## Root causes & fixes

### 1 — Preserve nav stack on protected inline actions (mobile)
**Cause:** `ensureAuthenticated()` used `context.go('/auth/connexion')` (replaces the stack) and the
verify screen finished with `context.go(returnTo)` (replaces again) → the browsing stack (and the
PDP's back button) was destroyed.
**Fix:** `ensureAuthenticated` is now `Future<bool>` that **pushes** the login flow over the current
screen and awaits it; a new `pushAuthFlowProvider` flag records "push mode". On success the OTP verify
screen **pops** connexion + itself (revealing the origin with its back button intact) and completes the
awaited push with `true`, so the original action (add-to-cart / favourite) **resumes in place** — Jumia
behaviour. The router's post-auth auto-redirect branch is skipped in push mode so it can't `go()` over
the preserved stack; the protected-route REDIRECT path (guest hits `/cart` etc.) keeps its
`go(returnTo)` behaviour. `canPop()` alone can't tell the two paths apart (true in both) — the explicit
flag is the deterministic signal.
**Files:** `core/auth/auth_guard.dart`, `core/router/app_router.dart`,
`features/auth/.../otp_verify_screen.dart`, callers `product_detail_screen.dart` +
`wishlist/.../wishlist_button.dart`.

### 2 — Jumia-style PDP cart bar (mobile)
**Cause:** the PDP bottom bar only rendered a static "Ajouter au panier".
**Fix:** new `cartItemProvider(productId)` selector (in `cart_provider.dart`) + a reactive `_PdpCartBar`
widget. Out of stock → disabled "Rupture de stock"; not in cart → "Ajouter au panier"; in cart →
`[ accueil | − | qté | + ]`. `+` caps at `product.quantity` (stock) with a French SnackBar at the
ceiling; `−` at qty 1 removes the line and restores the add button. Reflects cart state reactively, so
opening a PDP for an already-in-cart product shows the stepper immediately and qty stays synced with
cart/checkout. Reuses the existing optimistic `addItem` / `updateQuantity` / `removeItem`.
**Files:** `features/cart/.../cart_provider.dart`, `features/catalog/.../product_detail_screen.dart`.

### 3 — Intelligent search suggestions (mobile)
**Cause:** `catalog_repository.getSearchSuggestions()` read only `data['categories']`, discarding the
`products` + `brands` the endpoint already returns (backend FTS + `f_unaccent` + `pg_trgm` fuzzy +
synonyms — no API change).
**Fix:** returns a `SearchSuggestions {categories, brands}` type; the search screen renders **Catégories**
and **Marques** chips above the live product grid (products are the grid — the mobile equivalent of
buyer-web's product rows). Brand tap re-runs the search for the brand name (parity with buyer-web).
Debounce/loading/empty states unchanged.
**Files:** `features/catalog/data/catalog_repository.dart`, `features/catalog/.../search_screen.dart`.

### 4 — Valid idempotency key (mobile) — P0 blocker
**Cause:** `checkout_screen.dart` built a non-UUID key (`<millis>-<rand>`); the API's `CreateOrderDto`
rejects it via a strict UUID `@Matches`, which `HttpExceptionFilter` collapsed to the generic
"Erreur de validation" → mobile checkout was fully broken.
**Fix:** generate a real v4 UUID via the `uuid` package (promoted from transitive to a direct dep). Also
enhanced the shared `dio_error_messages.dart` to prefer the API envelope's field-specific
`error.errors[0].message` over the generic wrapper, so genuine validation errors show a specific French
reason (and nothing false fires when the key is valid). Mirrored to seller-mobile (Rule 15).
**Files:** `features/checkout/.../checkout_screen.dart`, `core/network/dio_error_messages.dart`
(both apps), `pubspec.yaml` (uuid).

### 5 — Town-mismatch warning at checkout (API + web + mobile)
**Cause:** the quote never exposed the seller's origin town, so neither client could compare it to the
delivery town.
**Fix (additive, no DB change):** `resolveDeliveryFee()` now returns `fromTown`; `quote()` adds per-seller
`fromTown` + `townMismatch` and a top-level `townMismatch` (OR across sellers), plus `buyerTown`. Compared
case- and whitespace-insensitively via `normalizeTown()`. Both clients render a **non-blocking** amber
warning card with the spec copy ("… ville différente … frais de transport supplémentaires … vérifier
votre adresse …"); the confirm button stays enabled.
**Files:** `apps/api/src/checkout/checkout.service.ts`, buyer-mobile
`checkout/data/models/checkout_model.dart` + `presentation/providers/checkout_provider.dart` +
`presentation/screens/checkout_screen.dart`, buyer-web `app/paiement/page.tsx`.

### 6 — Rate after delivery (API + web + mobile)
**Cause:** `canReview()` omitted the eligible `orderId`; `CreateReviewDto.orderId` is required → mobile
submitted `''` and web submitted nothing → 400. No rate entry-point on the order-detail page.
**Fix:** `canReview()` returns the most-recent eligible `orderId` (mobile `CanReviewModel` already parsed
it — it was just always null). Web `ReviewModal` now threads `orderId` into the POST (fixes the web 400).
Added a **"Noter le produit"** entry per delivered item on both order-detail pages (mobile →
`/products/:id/reviews`; web → PDP `#avis` anchor). Eligibility/moderation rules unchanged (DELIVERED
order, one-per-product `@@unique`, ACTIVE status) — only the already-required `orderId` is threaded through.
**Files:** `apps/api/src/reviews/reviews.service.ts`, buyer-mobile
`orders/.../order_detail_screen.dart` (product_reviews_screen already submitted the parsed orderId),
buyer-web `components/product-reviews.tsx` + `components/pages/product-detail-page.tsx` (anchor) +
`app/commandes/[id]/page.tsx` (rate CTA).

## API / DB / contract changes
- **No DB schema change, no migration.** Reviews already store `orderId`.
- **Quote response** gains `buyerTown`, top-level `townMismatch`, and per-seller `fromTown` +
  `townMismatch` (purely additive; older clients ignore them).
- **`can-review` response** gains `orderId` (additive).
- New direct dep: buyer-mobile `uuid ^4.5.3` (was transitive).

## Tests
- **API (Jest):** `src/reviews/reviews.service.spec.ts` (new — canReview returns orderId; ineligible /
  already-reviewed / soft-deleted paths) + `src/checkout/checkout.service.spec.ts` (new town-mismatch
  cases). Full suite green: **202 tests / 29 suites**.
- **Flutter:** `test/checkout/checkout_quote_test.dart` (townMismatch parse) +
  `test/network/dio_error_messages_test.dart` (field-specific validation message) +
  `test/cart/cart_item_provider_test.dart` (new). `flutter analyze lib test` clean;
  `buyer-web` `tsc --noEmit` clean.

## Risks
- Nav change touches the shared auth flow. Verified: push-path (PDP add-to-cart) preserves back button
  + resumes action; replace-path (deep-link/tab into a protected route) still logs in and lands on the
  target; cancel (back out of login) is a clean no-op. Claim-flow (magic link) is never push-mode → keeps
  its `go(returnTo)`.
- Quote/`can-review` changes are additive → no client breakage for un-updated surfaces.

## Manual verification (device / sim, dev flavor)
1. Guest → PDP → Ajouter → login → back on PDP **with back button**, item added.
2. PDP shows `[ accueil | − | qté | + ]` for in-cart products; +/− respect stock; qty 0 restores add.
3. Search "samsng" / "telephone" → category + brand chips (+ live product grid).
4. Checkout confirm → order created, **no** false "Erreur de validation".
5. Delivery address in a different town → amber warning card, confirm still enabled.
6. DELIVERED order → "Noter le produit" → review submits; second attempt blocked.

## Remaining / follow-ups
- None required. Optional future: surface individual product-suggestion rows on mobile search (currently
  products = the live grid); enable staging→TestFlight for review builds.
