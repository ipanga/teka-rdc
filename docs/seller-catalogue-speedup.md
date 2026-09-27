# Seller Catalogue Speed-up (started 2026-09-27)

Faster product publishing for sellers who photograph whole shelves. The work has four parts:

- in-app crop, with several crops taken from one preserved local photo
- « Ajouter un autre produit similaire »
- category search that understands aliases and brands
- two targeted taxonomy additions: « Lessive », and « Bébé › Alimentation bébé »

This file is the durable tracker. `STATUS.md` points here while the initiative is active, and `PROGRESS.md` gets one line per completed PR.

## Phase 0 — reconciliation (what already existed; do NOT rebuild)

Evidence: `STATUS.md` « FINAL RECONCILIATION PASS (2026-09-12) », plus a focused code read on 2026-09-27.

| Capability | State | Evidence | Leftover → action |
|---|---|---|---|
| Buyer search analytics | COMPLETE | `SearchQuery` (term, termNormalized, resultCount, cityId, source, intent SUBMIT/SUGGESTION) | — |
| Admin search analytics + CSV | COMPLETE | reports list/summary/trending/breakdown/csv; `common/utils/csv.util.ts` injection guard | — |
| Autocomplete / typo tolerance | COMPLETE | FTS `websearch_to_tsquery('french', f_unaccent(…))` + pg_trgm (`browse.service.ts buildSearchMatch`) | — |
| Search synonyms | COMPLETE | `SearchSynonym` groups, `expandSynonyms` (product text only) | — |
| Synonym admin CRUD | COMPLETE WITH MINOR GAP | API `reports/search-synonyms.controller.ts` (PR #797); **no admin-web page**; `docs/search-sales-analytics.md` still says there is no CRUD | PR C: small admin-web page + doc fix |
| Admin sales analytics | COMPLETE | DELIVERED-only, breakdowns by product/category/seller/town/day | — |
| Seller category characteristics | COMPLETE | leaf-only, server-owned `/v1/browse/categories/:id/attributes` | — |
| Brand/category relevance | COMPLETE | `BrandCategory` (341 links), « Autre » on every leaf | Boom, Cerelac absent → PR D |
| Taxonomy remediation, invariants, admin CRUD guards | COMPLETE | P3 closed; `common/taxonomy/category-structure.ts` | — |
| Seller category search | INCOMPLETE | mobile `category_selector.dart` matches the node name only, has no ranking, and can return a non-leaf; web `category-combobox.tsx` matches the path but has no aliases or ranking | PR C |
| Seller photo pipeline | INCOMPLETE + **defect** | no crop; photos can be added only after the product is saved; `duplicate()` copies `cloudinaryId`, so deleting on either product destroyed a file the other still used | PR A |

## Decisions

1. **Crop locally, upload only the confirmed crop.** The native cropper (`image_cropper`: uCrop on Android, TOCropViewController on iOS) writes a new file for every crop. The shelf photo, called the *source*, is copied into the app's temp directory (`teka_source/`) and never overwritten.
   - Nothing is uploaded before a crop is confirmed.
   - The full source photo is never uploaded.
   - *Rejected:* uploading the source to Cloudinary and cropping it with transformations. That would create an asset for every shelf photo, and each one would need its own lifecycle and orphan sweep.
2. **The source lives in a Riverpod app-scoped session** (`SourcePhotoSession`, not autoDispose), so it survives the move from product A's screen to product B's. It holds one source at a time.
   - A new pick replaces it.
   - « Terminer avec cette photo » deletes it.
   - Files older than 24 h are swept at app start.
3. **Upload failures keep the crop.** The seller gets « Réessayer » / « Abandonner ». A retry is an explicit tap only: the upload creates an image row, so it is not idempotent (Rule 15).
4. **Shared Cloudinary assets are reference-counted at delete time** (`common/uploads/shared-product-assets.ts`). All four destroy paths now delete the DB rows first and then destroy only the ids that no surviving `ProductImage` still references:
   - seller image delete
   - seller hard delete
   - admin hard delete
   - catalogue reset
   - *Rejected:* making `duplicate()` re-upload a copy of every image. That doubles the storage and upload time.
5. **The API contract is unchanged for PR A.** There is no temp-upload endpoint, no reorder endpoint and no schema change. The cover is still the first image by `displayOrder`.

## Cloudinary lifecycle (after PR A)

| Event | Local | Cloudinary |
|---|---|---|
| Pick camera/gallery | copy → `tmp/teka_source/source_<µs>.<ext>` (previous source deleted) | nothing |
| Crop cancelled | nothing new; source kept | nothing |
| Crop confirmed | new crop file (plugin temp) | nothing yet |
| Upload OK | crop file deleted | 1 asset, attached to that product |
| Upload failed | crop kept for « Réessayer »; deleted on « Abandonner » or when the screen is left | nothing, or at worst one asset if the server committed and the response was lost (the seller sees it after refresh) |
| « Terminer avec cette photo » | source deleted | nothing |
| App killed | source left behind | nothing; swept at the next start once it is more than 24 h old |
| Image or product deleted | — | destroyed only when no other `ProductImage` references the `cloudinaryId` |

## PR log

### PR A+B — crop, source reuse, shared-asset fix, similar product (`feat/seller-crop-similar-product`, one PR)

A and B are shipped together because the kept shelf photo is what the similar product's photo step reuses.

**A — crop, source reuse, shared-asset fix**

- **API:**
  - new `common/uploads/shared-product-assets.ts` (`unreferencedProductAssetIds`)
  - wired into `products.service.ts` (`deleteImage`, which is now DB-first, and `hardDelete`), `admin/admin-products.service.ts` and `admin/catalog-reset.service.ts`
  - specs: new helper spec, 3 `deleteImage` cases, 1 admin shared-file case
- **Seller-mobile:**
  - `image_cropper ^12.2.1` and `path_provider ^2.1.6` (direct; it was already transitive)
  - `UCropActivity` added to `AndroidManifest.xml`
  - new `lib/core/media/source_photo.dart` (picker, cropper, store and session, each injectable)
  - `ProductImageManager` rewritten around pick → adopt → crop → upload
  - startup sweep added in `main.dart`
  - PostHog events `seller_image_crop_completed {source}` and `seller_image_crop_cancelled`, with no paths, bytes or PII
- **Tests:** `test/features/products/product_photo_crop_test.dart`, 7 cases:
  - reuse is hidden without a source
  - only the crop is uploaded, and the source is byte-identical afterwards
  - a second crop does not trigger a second pick
  - cancel uploads nothing
  - a failed upload, then Réessayer, resends the same bytes
  - Terminer deletes the source
  - the stale sweep works
- **Schema / migration:** none. Old apps are unaffected.

**B — « Ajouter un autre produit similaire »**

- **Entry point:** a new action on the product detail screen, offered for every status. It pushes `/products/new` with `extra: ProductFormPrefill.fromProduct(product)` and emits `seller_similar_product_started`.
- **Prefill:** `lib/features/products/presentation/similar_product.dart`.
  - **Copied:** the category, the brand (dropped if the category no longer offers it, the form's existing rule), and SELECT/MULTISELECT values that are still current options (`similarProductSpecs`).
  - **Never copied:** TEXT, NUMERIC and date values; title; description; prices; promotion; stock; images; ids.
- **Form:**
  - A banner reads « Repris de « … » : catégorie, marque, N caractéristiques… » and offers « Tout effacer ».
  - The price starts empty. The hint « Prix du produit précédent : X FC » comes with a « Reprendre » chip (the user's decision).
  - Changing the category drops the prefill.
- **Server side:** the new product is created by the ordinary `POST /v1/sellers/products`, so ownership, id, shortCode, status and timestamps all come from the server, and the source product is never written. No API change.
- The deep link `/products/new` without `extra` still opens an empty form.
- **Tests:** 2 form tests, 1 pure test, 1 detail-navigation test, and updated per-status action expectations. Seller-mobile total: 501.
- **Android compile check:** `flutter build apk --debug --flavor production` built OK with uCrop.

## Remaining phases

- PR C — category search: `Category.searchKeywords`, `GET /v1/browse/categories/search`, the admin keyword field, the admin synonyms page, and the mobile and web selectors
- PR D — Lessive `LAUNDRY` template (« Type de lessive », « Poids » appended), Bébé › Alimentation bébé, curated keywords, Boom/Cerelac brands
- Phase 6/7 — cross-platform validation and close-out

## Validation ledger

| Item | Automated | Browser | Emulator | Real device |
|---|---|---|---|---|
| PR A crop / reuse / cancel | ✅ widget tests | n/a | ✅ Pixel 8 Pro emulator (Android 14, host GPU), dev flavor → isolated API :5051: gallery → uCrop (French title, square / 4:3 / Original presets) → upload; a cancelled crop (edge back-gesture) uploaded nothing; « Recadrer à nouveau » reopened the **full, untouched** shelf photo twice; cover = first image | **not tested** |
| PR A retry after failed upload | ✅ widget test | n/a | not exercised (would need network fault injection) | **not tested** |
| PR B similar product | ✅ widget tests | n/a | ✅ emulator: prefilled Lessive + Omo, free-text Volume left empty, price empty + « Reprendre 12.500 FC », saved as a NEW draft (new id + shortCode), source `updatedAt` unchanged; the kept shelf photo was offered and cropped for the new product | **not tested** |
| Android build with uCrop | ✅ debug APK built (production + development flavors) | — | — | — |
| Camera source (vs gallery) | shares the same pipeline, covered by widget test | n/a | not exercised (emulator virtual camera not driven) | **not tested** |
| iOS (TOCropViewController) | — | — | not built (no iOS build in this pass) | **not tested** |
| PR A shared-asset delete | ✅ unit | — | ✅ runtime against :5051 + read-only Cloudinary Admin API: duplicate → delete the clone's image → hard-delete the clone (`purgedAssets: 0`) → all 3 source assets still EXIST | — |

### Runtime notes (2026-09-27)

- Crop output measured on Cloudinary: square 1920×1920 → 24.5 KB, 4:3 1920×1440 → 21.9 KB, original 1920×1280 → 20.3 KB (WebP). This is well inside the 2G/3G budget.
- The first emulator run used SwiftShader software rendering and ANR'd everywhere, including the system permission controller. That was an environment problem, not an app one. Restarting with `-gpu host` fixed it: no ANR, and uCrop was fluid.
- The device check found image_picker's own cache copy of each pick left beside our source copy. `SourcePhotoSession.adopt` now deletes it after copying, but only inside the temp directory. This is covered by the widget test.
- **QA fixtures still on the dev DB and the shared Cloudinary cloud:**
  - seller `qa-crop@teka.test` (user `0f49422d-…`)
  - products `7f9cdf4a-…` and `38687a61-…` (both DRAFT)
  - 3 assets: `dxo3sqclekh12ed3izac`, `byo2ng4dlnt0o8j0ix7w`, `n2z9fbre9ojdmy2xrvdf`

  They are kept for the PR C seller-web and admin checks. **Delete them at close-out**: delete the images through the API, which destroys the assets, then hard-delete the products and delete the seller.
