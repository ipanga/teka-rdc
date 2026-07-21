# Seller Mobile — Submit, First-Load, Image Editing & Notifications Fixes

**Initiative started:** 2026-07-21 · **Branches:** phased PRs into `develop`.

Fixes four seller-facing defects found on a real device/TestFlight build of **seller-mobile**, keeping
parity with **seller-web**. Investigation (three parallel Explore agents) established that the seller
**notification stack is already fully implemented end-to-end** — so the work is surgical, not a rebuild.

## Task checklist

- [x] **P1 — Submit for review fails.** Surface the real API reason + guard 0-image submit. (PR #1)
- [x] **P2 — First-load error on Commandes/Produits.** Auth-guard provider auto-loads. (PR #2)
- [x] **P3 — Inline image editing in the edit form.** Extract shared image manager. (PR #3)
- [x] **P4 — Notifications.** Diagnosed; broadcast-tap routing + OS-permission truth fixed. (PR #4)

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

### P3 — Inline image editing  ✅ FIXED (PR #3)
A working `ProductImagesScreen` (add+delete) existed but was only reachable from the DRAFT detail screen's
"Ajouter" button — not from the edit form. seller-web manages images inline. Neither web nor mobile has a
reorder/cover endpoint (`products.controller.ts` exposes only `POST/DELETE :id/images`), so parity =
add+delete.

**Fix:**
- New `apps/seller-mobile/lib/features/products/presentation/widgets/product_image_manager.dart` —
  `ProductImageManager`, the single shared add+delete grid (reuses `ImageUploadTile` +
  `products_repository.uploadImage/deleteImage`; ≤8 images; `image_picker` 1200×1200 q80 +
  `compressImageForUpload` ≤500 KB WebP). Shrink-wrapped so it embeds in both a ListView and a Column.
  Upload/delete errors now surface via `friendlyErrorMessage` (was a generic string).
- `product_images_screen.dart` reduced to a thin `Scaffold` + `SingleChildScrollView` wrapper around it.
- `product_form_screen.dart` embeds `ProductImageManager` inline in the **edit** path (a section titled
  "Images" after the published-product notice). Create keeps the save→detail→add-images flow (no product
  id until first save).

**Cloudinary lifecycle (verified, no change needed):** `products.service.deleteImage` verifies owner then
calls `cloudinary.deleteImage(cloudinaryId)`, which **swallows + logs** failures (`logger.error`) and
returns, so the DB row is always removed and a failed destroy is logged for reconciliation — no orphan
blocks the user, no silent failure. Orphan-on-abandon (upload then leave) is assessed acceptable/follow-up.

**Display parity (unchanged):** image rendering across buyer-web/mobile PDP + admin moderation reads images
the same way; P3 only adds a management entry point, so display is unaffected. Manual cross-surface check
remains in the verification checklist.

**Tests:** `test/features/products/product_image_manager_test.dart` — count header + add tile under max;
add-tile hidden + "Maximum atteint" at 8. Full suite (9) green; analyze clean on our source (the 4 info
`use_build_context_synchronously` lints match the codebase style, moved from the old screen).

**No DB / API change.**

### P4 — Notifications  ✅ FIXED (PR #4)
**Diagnosis (code-level, since an on-device pass needs a device/emulator):** the seller notification stack is
already fully wired — backend writes `UserNotification` rows for order + product-moderation events and for
broadcasts, `/v1/seller/notifications` returns them, device tokens register on login, FCM foreground/tap
handlers exist. Findings:
- **Empty Centre root cause = the P2 race** (the notifications provider auto-loaded pre-auth and cached an
  empty/error feed). Fixed in PR #2 (now auth-gated).
- **Broadcast push tap routed nowhere (real gap).** A plain admin broadcast sends `{ screen: 'notifications' }`
  (`broadcasts.service.ts:383`), but the seller `NotificationRouter` had no such case → tap did nothing.
  buyer-mobile already handled it.
- **Admin `ALL_SELLERS` audience already exists** (`admin-web …/broadcasts/page.tsx` — "Tous les vendeurs").
  No gap.
- **Settings didn't reflect OS permission (real gap).** The settings screen only read/wrote backend prefs; a
  toggle could read "on" while the phone had notifications denied → push silently never arrives.

**Fixes:**
- `apps/seller-mobile/lib/core/push/notification_router.dart` — added `case 'notifications' → '/notifications'`
  (parity with buyer-mobile). Test: `test/core/push/notification_router_test.dart`.
- `apps/seller-mobile/lib/core/push/push_service.dart` — added `getPermissionStatus()` (reads OS permission
  via `getNotificationSettings()` **without** prompting).
- `…/profile/presentation/screens/notification_settings_screen.dart` — reads the OS status on load and shows
  a truthful banner: **denied** → "notifications désactivées dans les réglages… réactivez-les" (no false
  "enabled"); **notDetermined** → an "Activer les notifications" button that requests permission. Toggles
  still control the backend channel prefs (email fallback stays meaningful).

**Deliberately deferred (documented):** a one-tap "open system settings" deep-link needs a new native package
(`app_settings`/`permission_handler`) — not added to keep scope minimal and avoid an unverifiable native dep;
the banner instructs the seller to open Réglages manually. The core requirement (never claim enabled when the
OS denied) is met.

**No DB / API change.** Tests: full suite (11) green; analyze clean on our source.

### ⚠️ Remaining manual verification (needs a device/emulator)
On-device runtime pass not performed in-session. Before closing the initiative, run seller-mobile (dev
flavor) against `pnpm dev:api` and confirm: (1) cold-start Commandes/Produits/Centre load without the
error→retry; (2) trigger an order + a product approve/reject + an `ALL_SELLERS` broadcast → all appear in the
Centre + home badge, and tapping each push deep-links correctly (incl. the plain broadcast → Centre);
(3) deny OS notifications → the settings banner reflects it.

## Risks / notes
- P1 relies on the API keeping its French validation messages (it does; specs now lock them in).
- Cloudinary orphan cleanup (P3) is assessed as acceptable/follow-up, not built here.

## Resume instructions
All four phases implemented across PRs #1–#4 (stacked: #550 ← #551 ← #552 ← #4). Merge in order into
`develop` (retarget each PR's base to `develop` as the previous one merges). Then run the **Remaining manual
verification** on-device pass above and tick it off. Nothing else outstanding.
