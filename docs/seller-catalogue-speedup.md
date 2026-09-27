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

### PR #814 — MERGED into `develop` 2026-09-27 (`6d66323`)

CI was fully green, including CodeQL. The first CI run found a timing flake in the new crop tests: fixed waits did not cover real file IO on the slower runner. The tests now wait on conditions (`7a1c0e7`).

### PR C+D — category search, aliases, admin pages, targeted taxonomy (`feat/category-search-keywords`)

**C — search.** All of the following are additive.

- **Schema:** `Category.searchKeywords TEXT[] NOT NULL DEFAULT '{}'`, migration `2026-09-27_category_search_keywords.sql` (auto-apply).
- **Privacy:** `PrismaService` omits the column globally, so it never reaches a buyer payload. That covers the tree, the category detail, and every `include: { category: true }` on products. It was verified on dev: the `/browse/categories` and `/browse/categories/lessive` payloads carry no `searchKeywords`.
- **Endpoint:** `GET /v1/browse/categories/search?q=&limit=` is public, throttled at 40 requests per 10 s, and returns leaves only. The ranker (`common/taxonomy/category-search.ts`) is pure and runs over a 60 s in-memory index of live leaves: name, path, aliases, and linked brands except « Autre ».
- **Admin:**
  - A « Mots-clés de recherche / Synonymes » field on the category editor. The API cleans the input: trim, collapse spaces, de-duplicate ignoring case and accents, at most 40 terms of 2–60 characters each.
  - A new page « Synonymes de recherche » for the #797 API, with create, edit, deactivate/reactivate and a two-step delete.
- **Pickers:** both seller pickers (mobile `category_selector.dart`, web `category-combobox.tsx`) call the endpoint with a debounce. They fall back to a local name/path match on leaves while waiting and when offline. The mobile search no longer offers intermediate nodes.
- **Decision:** `SearchSynonym` is NOT reused for categories. It is term equivalence for product text and has no category relation, so the two sources stay separate (`docs/seller-catalog-taxonomy.md` has a table).

**D — targeted taxonomy.** Additive only. No product moved, no id or slug changed, no specification touched.

- Lessive gets a dedicated `LAUNDRY` template. « Type de lessive » (Poudre/Liquide/Capsules/Savon) and « Poids » are appended after the live Volume/expiry slots.
- New leaf Supermarché › Bébé › **Alimentation bébé** (…010505, FOOD template).
- New brands Boom (71) → Lessive and Cerelac (72) → Alimentation bébé. Nestlé and « Autre » are also linked to the new leaf.
- Curated aliases (`kw`) on ten leaves.
- **Migration `2026-09-27_taxonomy_laundry_babyfood_keywords.sql`:**
  - Refusal-first guards run first, and the whole file is one transaction.
  - The attribute and alias blocks are GENERATED from `taxonomy-data.ts` and pinned by `taxonomy-laundry-babyfood-sql.spec.ts`.
  - The file is on the auto-apply list, after the column migration.
- **Dev DB:** the migration was applied twice (idempotent). `taxonomy:diff` shows no new drift entry; dev's 303 additive entries are pre-existing drift. Production is expected to stay at additive 0 / judgement 0 after apply.

**Acceptance on real dev data** (API and browser):

| Query | Result |
|---|---|
| « omo », « boom », « ariel » | Lessive (brand) |
| « savon poudre », « savon en poudre » | Lessive only |
| « detergent » | Détergents first, then Lessive |
| « cerelac », « nestle cerelac », « bouillie » | Alimentation bébé |
| « bebe » and «  BÉBÉ  » | Alimentation bébé first |
| « cereales » | Céréales |
| « eau de javel » | Javel |

## Taxonomy audit — reported, NOT changed (catalogue decisions needed)

| # | CURRENT STATE | PROBLEM | RECOMMENDATION | AFFECTED | MIGRATION IMPACT / RISK |
|---|---|---|---|---|---|
| T1 | Two soap leaves: Supermarché › Hygiène Personnelle › **Savons** (10301) and Beauté & Santé › Soins Personnels › **Gels douche & Savons** (60201) | A seller cannot tell which one to use for a bar of toilet soap, so listings get split | Keep Savons for bar soap and rename 60201 « Gels douche & savons liquides », or merge. Aliases now separate them for search | 2 leaves plus their products (prod count to be taken read-only first) | A rename is cheap. A merge moves products and needs a refusal-first migration. Low–medium risk |
| T2 | Entretien Maison: Lessive · Détergents · Javel · Nettoyants · Désinfectants | « Détergents » and « Nettoyants » overlap: multi-purpose cleaner fits both. « Détergents » is also a common word for laundry powder | Keep all five. Aliases now route: dishwashing and degreaser go to Détergents, floor/windows/WC to Nettoyants, antiseptic to Désinfectants. Optionally rename Détergents to « Vaisselle & dégraissants » | 5 leaves | A rename only changes the name; the slug stays (seed recomputes slugs, so run taxonomy:diff first). Low risk |
| T3 | The `vnkqce` « Savon de lessive » product carries a legacy foreign « Type = Savon de lessive » spec (invariant-2 allowlist) | It can now be expressed canonically as « Type de lessive = Savon » | A reviewed P3-4-style repoint migration: keep the spec row id, repoint it to …1040103 with the value « Savon », retire nothing | 1 product, 1 spec, allowlist 3 → 2 | A refusal-first single-row migration. Low risk, but it is a catalogue decision |
| T4 | Lessive, as named today | The suggested rename is « Lessive & Soin du linge » | **Not recommended now.** Aliases cover « linge ». A rename changes buyer-visible text and invites a later slug change | 1 leaf | None if skipped |
| T5 | Leaf 30303 is named **« Nintendo »** (a brand used as a category) | This violates the brands-are-not-categories rule | Rename it to « Consoles portables » or similar, with Nintendo as a brand link | 1 leaf plus products | Rename plus a brand link. The slug is buyer-visible, so this is an SEO/redirect decision. Medium risk |
| T6 | Dev DB still has « Déodorants » 10304 active and 303 additive drift entries | Dev drift only; prod was reconciled | Leave it. Never run `db:push` against dev | — | — |

## Close-out (2026-09-27)

- **#817 merged into `develop`.** CI was fully green. CodeQL's first run flagged a type confusion (`?q=a&q=b` arrives as an array); `q` and `limit` are now used only when they are strings, covered by an e2e test.
- **Production release is a separate, approved step:**
  1. A release PR `develop → main` auto-applies the two migrations in manifest order, before the rolling swap.
  2. Then run `pnpm --filter api taxonomy:diff:prod`, read-only; expect additive 0 / judgement 0.
  3. Smoke-test `GET https://api.teka.cd/api/v1/browse/categories/search?q=omo`; expect Lessive.
- **Seller-mobile needs a store build.** `image_cropper` adds native code, so an OTA-style change is impossible and the version must be bumped. Buyer-mobile is untouched.

## Release (started 2026-09-27)

| Gate | State |
|---|---|
| Pre-release verification | ✅ done (see `STATUS.md`) |
| Release PR #818 `develop → main` | ✅ approved and merged as `860b740` |
| Deploy + EXPAND migrations | ✅ run 36335462366 succeeded; « 2 applied, 14 skipped »; each migration once (ledger 49 → 51) |
| Post-deploy verification | ✅ counts exact (356/590/72/345/505/353); taxonomy:diff:prod 0/0/1; smoke omo/boom/savon poudre/cerelac/détergent correct and leaf-only; aliases absent from the buyer tree, category detail and product page; seller/admin noindex intact. Sentry not checked (no access) |
| Seller-mobile bump 0.1.11+13 | ✅ #820 → #821, `main` `60d70ac`; redeploy 36337328372 succeeded (0 applied, 16 skipped) |
| CI race in the crop test (cleanup after upload) | ✅ fixed, test-only (#822) |
| Seller TestFlight | ✅ run 36337679322 (owner approved `ios-testflight`): « Successfully finished processing the build 0.1.11 - 1790530851 », « Verified … available to 'Testers Teka RDC' » |
| Seller Play internal | ✅ run 36337681264 (owner approved `android-play`): mapping for version code 13 uploaded, « Updating track 'internal' », « Successfully finished the upload to Google Play »; metadata skipped, `release_status completed` |
| Physical-device checklist | **NOT performed**: needs owner hardware (list below) |

### Physical-device checklist (Seller 0.1.11: TestFlight build 1790530851 / Play internal versionCode 13)

Nothing below has been tested on a physical device. Tick an item only after it has actually been run on one.

1. Select one shelf photo containing several products.
2. Crop Product A from it.
3. Create Product B by reusing the same shelf photo (« Recadrer à nouveau la photo précédente ») and cropping another region.
4. Confirm the original photo stays usable (its full frame reopens).
5. Cancel a crop and confirm nothing is uploaded.
6. Force a failed upload (airplane mode) and confirm « Réessayer » sends the same crop once.
7. Confirm local crops are cleaned up (after the upload, after « Terminer avec cette photo », and after 24 h).
8. Use « Ajouter un autre produit similaire ».
9. Confirm the category, the brand and valid choice-type characteristics are carried over.
10. Confirm the price starts empty.
11. Confirm the « Prix du produit précédent » hint and « Reprendre » work.
12. Confirm a « Dupliquer » product shares its assets, and that a similar product has its own.
13. Delete or change an image on a duplicate and confirm the source product's image stays intact.
14. Search the categories for omo, boom, savon poudre, cerelac and détergent.
15. Confirm search returns leaf categories only.
16. Confirm aliases are never displayed to sellers or buyers.
17. Confirm the admin category alias editor and the « Synonymes de recherche » page still work (web).

Items 1–16 must be run on **both** an Android phone and an iPhone. The iOS crop screen has not run anywhere yet.

## Genuine remaining work

| Priority | Item | Reason | Next action |
|---|---|---|---|
| P1 | Release to production | Nothing ships until `main` | Owner approves a `develop → main` release PR; watch EXPAND apply both migrations; run `taxonomy:diff:prod` |
| P1 | Seller-mobile store build | Crop + search are client code | Bump seller-mobile, then dispatch the AAB/IPA workflows (they need the approval gates) |
| P2 | Real-device validation | Emulator only; iOS crop never built | Test on an Android device and an iPhone: camera → crop → 2 products from one photo; retry on a flaky network |
| P2 | Catalogue decisions T1–T5 | Broad changes need the owner | Decide per row, then a narrow refusal-first migration each |
| P3 | Admin alias edits take up to 60 s to show in search | In-memory index cache | Acceptable. If needed, invalidate the index on category update (same process) |
## Validation ledger

| Item | Automated | Browser | Emulator | Real device |
|---|---|---|---|---|
| PR A crop / reuse / cancel | ✅ widget tests | n/a | ✅ Pixel 8 Pro emulator (Android 14, host GPU), dev flavor → isolated API :5051: gallery → uCrop (French title, square / 4:3 / Original presets) → upload; a cancelled crop (edge back-gesture) uploaded nothing; « Recadrer à nouveau » reopened the **full, untouched** shelf photo twice; cover = first image | **not tested** |
| PR A retry after failed upload | ✅ widget test | n/a | not exercised (would need network fault injection) | **not tested** |
| PR B similar product | ✅ widget tests | n/a | ✅ emulator: prefilled Lessive + Omo, free-text Volume left empty, price empty + « Reprendre 12.500 FC », saved as a NEW draft (new id + shortCode), source `updatedAt` unchanged; the kept shelf photo was offered and cropped for the new product | **not tested** |
| Android build with uCrop | ✅ debug APK built (production + development flavors) | — | — | — |
| Camera source (vs gallery) | shares the same pipeline, covered by widget test | n/a | not exercised (emulator virtual camera not driven) | **not tested** |
| iOS (TOCropViewController) | — | — | not built (no iOS build in this pass) | **not tested** |
| PR C search endpoint + ranking | ✅ unit (15) + e2e (2) + DTO + service | ✅ seller-web combobox: « omo », « savon poudre », « cerelac », « hygiene » → the right leaves; selecting Lessive loads « Type de lessive » + « Poids » and the Boom/Omo brands | ✅ emulator (rebuilt APK → :5051): « savon poudre » → only Lessive; « cerelac » → Alimentation bébé; selecting it loads « Poids » + « Date d'expiration » | **not tested** |
| PR C admin keywords | ✅ vitest + API spec | ✅ admin-web: migrated aliases shown; a keystroke edit saved, collapsed spaces, merged a case/accent duplicate; restored afterwards | — | — |
| PR C admin synonyms page | ✅ type-check | ✅ create, deactivate, reactivate, two-step delete; « gsm » conflict shows the API's French refusal next to the form | — | — |
| PR D taxonomy | ✅ shape + generated-SQL specs (276 taxonomy tests) | ✅ admin tree shows « Alimentation bébé » | — | — |
| Mobile-created product on seller-web | — | ✅ product 7f9cdf4a opens on the web edit page with both cropped images in order (cover first) | — | — |
| Buyer web / buyer mobile | no buyer code changed | **not browser-tested**: QA products are drafts, and images are ordinary WebP through the unchanged pipeline | — | — |
| PR A shared-asset delete | ✅ unit | — | ✅ runtime against :5051 + read-only Cloudinary Admin API: duplicate → delete the clone's image → hard-delete the clone (`purgedAssets: 0`) → all 3 source assets still EXIST | — |

### Runtime notes (2026-09-27)

- Crop output measured on Cloudinary: square 1920×1920 → 24.5 KB, 4:3 1920×1440 → 21.9 KB, original 1920×1280 → 20.3 KB (WebP). This is well inside the 2G/3G budget.
- The first emulator run used SwiftShader software rendering and ANR'd everywhere, including the system permission controller. That was an environment problem, not an app one. Restarting with `-gpu host` fixed it: no ANR, and uCrop was fluid.
- The device check found image_picker's own cache copy of each pick left beside our source copy. `SourcePhotoSession.adopt` now deletes it after copying, but only inside the temp directory. This is covered by the widget test.
- **QA fixtures cleaned up (2026-09-27):**
  - The 3 QA images were deleted through the seller API. The read-only Cloudinary Admin API then answers 404 for all three, so the last-reference path still destroys.
  - Both QA products were hard-deleted.
  - The QA seller and QA admin users were removed from the dev DB, with their refresh tokens (21), device token (1) and seller profile (1).
  - The isolated API (:5051) and the seller-web (:5100) and admin-web (:5200) dev servers were stopped.
  - The scratch files holding the QA passwords were deleted.
  - Nothing QA-related remains.
