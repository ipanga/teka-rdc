# Seller Mobile — Submit, First-Load, Image Editing & Notifications Fixes

**Initiative started:** 2026-07-21 · **Branches:** phased PRs into `develop`.

Fixes four seller-facing defects found on a real device/TestFlight build of **seller-mobile**, keeping
parity with **seller-web**. Investigation (three parallel Explore agents) established that the seller
**notification stack is already fully implemented end-to-end** — so the work is surgical, not a rebuild.

## Task checklist

- [x] **P1 — Submit for review fails.** Surface the real API reason + guard 0-image submit. (PR #1)
- [x] **P2 — First-load error on Commandes/Produits.** Auth-guard provider auto-loads. (PR #2)
- [ ] **P3 — Inline image editing in the edit form.** Extract shared image manager. (PR #3)
- [ ] **P4 — Notifications.** Runtime-diagnose empty Centre; targeted fixes only. (PR #4)

## Root causes

### P1 — Submit fails with a generic banner  ✅ FIXED (PR #1)
The product had **0/8 images**. The API (`products.service.ts:735`) correctly rejects a 0-image
submission with *"Le produit doit avoir au moins une image avant la soumission"*, but the mobile
`catch` block in `_submitForReview` (`product_detail_screen.dart`) discarded that message and showed a
hardcoded generic string — the seller never learned why. seller-web's list page silently swallowed the
same error (`catch {}`).

**Fix (files changed):**
- `apps/seller-mobile/lib/features/products/presentation/screens/product_detail_screen.dart`
  - `catch (e)` → `friendlyErrorMessage(e)` (reuses `core/network/dio_error_messages.dart`, which already
    prefers the field-specific French reason and reports only *unexpected* errors to Sentry).
  - Pre-flight guard: when `product.images.isEmpty`, skip the network round-trip and show an actionable
    French SnackBar with an **"Ajouter"** action that deep-links to `/products/{id}/images`.
  - Duplicate-tap safety already present (`onPressed` gated on `_isSubmitting`) — confirmed.
- `apps/seller-web/src/app/dashboard/products/page.tsx` — `handleSubmit` now surfaces
  `ApiError.message` in the existing `error` banner instead of swallowing it (parity with the detail
  page `[id]/page.tsx`, which already surfaced it).

**Tests:** `apps/api/src/products/products.service.spec.ts` — added 3 cases to *ProductsService lifecycle
transitions*: 0-image DRAFT → 400 (image message), non-DRAFT → 400, DRAFT+image+price → PENDING_REVIEW.
26 specs green. seller-web `type-check` clean. seller-mobile `flutter analyze` clean (only pre-existing
`use_build_context_synchronously` infos in untouched methods).

**No DB / API-contract change.**

### P2 — First-load race  ✅ FIXED (PR #2)
Seller `StateNotifier`s auto-loaded in their constructors before auth tokens restored on cold start →
request with no bearer → 401 → error cached until "Réessayer". The fix pattern already existed in
`dashboardStatsProvider` (`products_provider.dart`) but was never ported.

**Fix:** each affected `StateNotifierProvider` now (a) starts the notifier in a **loading** state and
**stops fetching from the constructor**, and (b) drives the first/re-load from the provider factory via
`ref.listen(authProvider.select((s) => s.status), …, fireImmediately: true)` — loading only on the
transition into `AuthStatus.authenticated`. `fireImmediately` covers the warm path (already
authenticated); the transition guard covers the cold path. Until auth resolves the screen shows a
skeleton, never a cached 401.

**Files (all `apps/seller-mobile/lib/features/…/presentation/providers/`):**
- `orders/orders_provider.dart` (Commandes), `products/products_provider.dart` (Produits),
  `notifications/notifications_provider.dart` (Centre — the likely cause of the empty feed),
  `earnings/earnings_provider.dart` (Revenus — 2 loaders), `promotions/promotion_provider.dart`,
  `reviews/reviews_provider.dart`.
- `home/home_screen.dart`: removed the now-redundant manual reload-on-auth workaround (would double-load).

**Tests:** `test/features/products/products_provider_test.dart` — notifier does **not** fetch in its
constructor, starts in a loading (non-error) state, and `loadProducts()` fetches once. Full suite (7) green;
`flutter analyze` clean on our source (only vendored `build/ios/SourcePackages` example noise).

**No DB / API-contract change.**

### P3 — Inline image editing  ⏳ pending
Working `ProductImagesScreen` (add+delete) exists but isn't reachable from `ProductFormScreen`. Extract a
shared `ProductImageManager`. Neither web nor mobile has a reorder/cover endpoint → parity = add+delete.

### P4 — Notifications  ⏳ pending (diagnose at runtime first)
Backend feed + device tokens + `ALL_SELLERS` broadcasts + order/product events all already exist and are
wired. Empty Centre is most likely the P2 race or a no-notification test account. Diagnose before coding.

## Risks / notes
- P1 relies on the API keeping its French validation messages (it does; specs now lock them in).
- Cloudinary orphan cleanup (P3) is assessed as acceptable/follow-up, not built here.

## Resume instructions
Next: **P3** — branch `fix/seller-mobile-inline-image-edit` (stacked on the P2 branch); extract a shared
`ProductImageManager` (add+delete, reusing `ImageUploadTile` + `products_repository` upload/delete) and
embed it in `ProductFormScreen`'s edit path; verify Cloudinary destroy logging; cross-surface display check.
