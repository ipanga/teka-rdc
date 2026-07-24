# Seller Product Images & Category Attributes Fixes

**Initiative started:** 2026-07-23 · **Branches:** phased PRs into `develop`.

Three seller product-posting improvements from device screenshots: tappable image placeholder,
camera capture, and category-specific attributes (a monitor showing cooker attributes).

## Task checklist

- [x] **P1 — Empty image placeholder tappable** (seller-mobile). PR A.
- [x] **P2 — Camera capture** (Prendre une photo / Choisir dans la galerie). PR A.
- [x] **P3 — Category/subcategory-specific attributes** (leaf-only + admin guard + data cleanup). PR B.

## Root causes & fixes

### P1 — Placeholder not tappable  ✅
`product_detail_screen.dart` rendered the empty-images placeholder as a plain non-interactive
`Container`; only the "Ajouter" link opened the manager. **Fix:** wrapped the placeholder in an
`InkWell`/`Material` (with `Semantics(button:true)`) that opens the same
`context.push('/products/{id}/images')` route, gated to editable (DRAFT/REJECTED) products, and added an
"Ajouter des images" label + add-photo icon. Non-editable products keep a static placeholder.

### P2 — No camera capture  ✅
`product_image_manager.dart._pickAndUploadImage` hardcoded `ImageSource.gallery`. **Fix:** a French
bottom-sheet chooser (`_chooseSourceAndUpload`) — **"Prendre une photo"** (camera) / **"Choisir dans la
galerie"** (gallery) — and `_pickAndUploadImage(source)` now takes the chosen source. Reuses the existing
compress-to-WebP + Cloudinary upload pipeline; duplicate-tap guarded (`_isUploading`); camera/photo
permission-denied `PlatformException` mapped to a French hint. **iOS:** added `NSCameraUsageDescription`
+ `NSPhotoLibraryUsageDescription` to `ios/Runner/Info.plist` (were missing). **Android:** no manifest
permission needed (image_picker delegates to the system camera). seller-web keeps gallery upload (no
native camera) — parity of business rules preserved.

### P3 — Wrong-category attributes  ✅ (root cause found + fixed)
A **monitor** ("Moniteurs") form showed cooker "Type" (Cuisinière à gaz…) + "Nombre de feux" mixed with
Taille écran/Résolution. **Root cause:** `BrowseService.getCategoryAttributes` queried
`productAttribute WHERE categoryId IN [self, parent, grandparent]` — a **parent-chain merge**. Attributes
attach per product type (the leaf), but the admin UI lets you add attributes to *any* category, so cooker
attributes created on the **Informatique** parent leaked into every descendant (monitors, laptops…).
Confirmed by reproducing against a seeded DB: injecting a cooker "Type"+"Nombre de feux" on the
Informatique parent made the endpoint return them for Moniteurs.

**Fix (3 parts):**
1. **API leaf-only** (`browse.service.ts`) — `getCategoryAttributes` now returns `where: { categoryId }`
   only (the leaf), matching the documented "attributes attach per product type". Single caller
   (`GET /v1/browse/categories/:id/attributes`, the seller form) — no other consumer relied on inheritance.
2. **Admin guard** (`categories.service.ts.createAttribute`) — rejects (400) adding an attribute to a
   category that has children (non-leaf), preventing the contamination at the source. French message.
3. **Data cleanup** (`prisma/migrations/manual/2026-07-23_prune-non-leaf-attributes.sql`) — deletes
   product_attributes on non-leaf categories **that are unreferenced** by any product_specification.
   **Backward-compatible:** legacy attributes a product actually used are preserved (their spec rows stay;
   the leaf-only fetch just stops offering them in new/edit forms). Idempotent; leaves never lose
   attributes. Verified: pruned the injected cooker rows, kept 16 referenced legacy rows.

**No Prisma schema change.** **Deployment order:** deploy API (leaf-only immediately fixes the symptom for
all cases) → then apply the prune SQL via the "Apply prod migration" Action (hygiene; safe either order).

## Tests
- API: `browse.service.spec` (leaf-only where-clause; NotFound) + `categories.service.spec`
  (createAttribute non-leaf reject / leaf allow). Full API suite **209 green**.
- Flutter: `product_image_manager_test` (camera/gallery chooser opens with both French options) + existing
  count/max cases. `flutter analyze` clean on our source.
- **On-device (Android emulator, dev flavor, local seeded DB):** P1 — placeholder tap opens the manager;
  P2 — chooser → "Prendre une photo" → device camera → capture → compress → **Cloudinary upload** →
  thumbnail (1/8 images); P3 — new **Moniteurs** product shows only Taille écran / Résolution / Garantie
  (cooker attrs gone despite injected parent contamination).

## Risks / notes
- Leaf-only drops parent-attribute inheritance by design (none exists in the seed; matches the taxonomy
  doc). If a future need arises for shared category-level attributes, reintroduce explicitly, not via a
  silent parent-walk.
- Prune SQL only removes unreferenced non-leaf attributes — referenced legacy data is retained.
- Observed (out of scope, noted): the product **create** form masks API validation reasons ("La
  description est requise") behind a generic error — same class as the earlier submit-for-review fix;
  candidate follow-up.

## Resume instructions
Both PRs open into `develop` (image-entry P1/P2; attributes P3). After merge, apply the prune migration on
prod via the Apply-migration Action. Nothing else outstanding.
