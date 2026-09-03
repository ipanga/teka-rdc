# Status — 2026-09-03

> **What this file is.** A single, hand-edited snapshot of *what is in-flight RIGHT NOW*. Read it first on every resume — before `CLAUDE.md`, before `PROGRESS.md`. When `## Active initiative` gets long, move its contents into `PROGRESS.md` history and reset this file.
>
> **Update rule.** Touch this file in the same commit that starts or ends an initiative. No drift window.

## Active initiative

**None.** The Search & Sales Analytics initiative (Workstreams B, C, D) is **fully integrated into
`develop`** as of 2026-09-03. Nothing is in flight. **Not released to `main`, not deployed, and its
migration has NOT been run against production.**

## Most recently completed initiative

**Search & Sales Analytics + the order-lifecycle prerequisite — MERGED TO `develop` 2026-09-03.**
Final `develop` SHA **`9efe42a`**; pre-initiative baseline was `307ad93`.

| PR | Merge commit | What |
|---|---|---|
| #625 | `33a816b` | shared CSV writer + formula-injection guard |
| #626 | `3ac6c7c` | CAT report windows, DTO bounds, pagination, N+1 fix |
| #627 | `9075d56` | sales analytics breakdown (product/category/seller/town/day) |
| #629 | `3a1c0be` | search `source` + `searchIntent` (write path, + migration) |
| #630 | `db7628d` | admin search analytics (read surface) |
| #628 | `9efe42a` | `DELIVERED ⇒ deliveredAt` lifecycle invariant *(independent)* |

Merged in that order with real merge commits, never squashed. #628 needed one expected `PROGRESS.md`
conflict resolved — **both initiatives' entries were preserved**, none discarded.

Combined footprint: **41 files**, +5,804 / −269, across api · admin-web · buyer-web · buyer-mobile ·
docs. **Zero seller-web and zero seller-mobile files.**

### Integrated gates on `9efe42a`

API **507 unit** / **135 e2e** (0 failures in 8 consecutive runs) · buyer-web **74** · buyer-mobile
**238** + analyze 6 known infos · seller-mobile **42** + analyze 17 infos (all pre-existing, exit 0,
zero seller files changed) · admin-web build clean · `pnpm type-check` clean across 5 projects.

### The one thing to know before releasing

**`manual/2026-09-05_search_query_source_intent.sql` is on `auto-apply.list`**, so the next
`develop → main` deploy will apply it automatically, before the rolling swap. It is additive and
idempotent — two `pg_type`-guarded enum creations plus `ADD COLUMN IF NOT EXISTS` with O(1)
non-volatile defaults, **no backfill, zero destructive statements**. Existing rows become
`source = UNKNOWN`, `intent = SUBMIT`, which is the truthful reading (they predate the parameters).

**Deployment order is already safe** and needs no manual sequencing: `forbidNonWhitelisted` turns an
undeclared query param into a hard 400, and the API accepting `searchSource`/`searchIntent` ships in
the *same* artifact as the buyer-web client that sends them. buyer-mobile reaches devices only on a
future store build and sends nothing until then — those rows land `UNKNOWN/SUBMIT` by design.


**Seller Catalog Taxonomy — RELEASED to production 2026-09-02, both data migrations applied.**
Release PR **#618** (`develop → main`, merge commit `ce76525`, 16 commits / 14 files / +1,632 −23),
back-merged so `main == develop == ce76525`. Deploy run `33667591201`: all 5 jobs green. The release
carried Phases 1 (#615), 2a (#616), 2b (#617) and the seller/admin consistency fix (#619).

**Root cause.** Products could attach to an *intermediate* category, which still carries legacy
pre-refactor attribute rows (« Mode > Homme » holds `Type de peau`), and the leaf-only rule was
documented but enforced nowhere. Shipped: the API leaf-category invariant (`create()` always;
`update()` only when `categoryId` changes, so legacy products stay editable); leaf-only selection in
the seller-web combobox plus a legacy-category warning; server-side preservation of foreign
`ProductSpecification` rows (a quantity edit used to wipe values the seller was never shown); and one
shared canonical characteristics representation used by the buyer, seller and admin detail endpoints.

**The PDP rule that was REJECTED, and why it matters.** Scoping characteristics to
`attribute.categoryId === product.categoryId` was tried first and **disconfirmed by a read-only
production audit**: 18 foreign specification rows exist across 9 live products and **7 would have been
left with no characteristics at all** (a 10 kg bag of rice losing « Poids », an Android phone losing
RAM / Mémoire interne). Those rows are legitimate — the pre-3-level taxonomy attached attributes at
subcategory level. The rule in force **preserves** foreign rows and de-duplicates **by name**,
preferring the product's current category, normalised with `stripAccents()`, with deterministic
precedence (own-category → `sortOrder` → `attributeId`).

**Migrations applied to production** — both by hand via the `Apply prod migration` workflow, in this
order, each verified before the next:

1. `2026-09-02_prune_invalid_brand_category_links.sql` — run `33668468256`, `INSERT 0 121 / DELETE 121`.
   Live-brand links **433 → 314**; leaf links unchanged at 314; intermediate 66 → 0; soft-deleted
   53 → 0; 49 brands, none deleted; **leaf coverage identical in every category**. Reversible via
   `brand_categories_archive_20260902` (68 + 53 = 121 rows).
2. `2026-09-03_remediate_legacy_category_products.sql` — run `33668783372`.
   `h0d799` → « Mode > Homme > Chemises »; the buyer PDP shows Taille=M / Couleur=Bleu / Matière=Coton
   exactly once each, with all **6 rows still stored** (3 new + 3 original Électroménager preserved).
   `vnkqce` → « … > Lessive », legacy `Type = Savon de lessive` preserved and visible, no mapping
   invented. `rb7t4r` untouched — its `updatedAt` is still 2026-07-27. Reversible via
   `product_remediation_20260903` (`category_repointed=2, spec_inserted=3`).

**Verified live before touching data:** the new API was proven deployed behaviourally —
`GET /v1/browse/categories/…000000000501/attributes` (« Mode > Homme ») returns `[]` where production
previously returned `Type, Type de peau` — and the legitimate foreign characteristics above were
confirmed intact both before and after each migration. **Sentry was NOT checked** (no `sentry-cli`, no
auth token available); health endpoints and all three surfaces were.

Tracker: `docs/seller-catalog-taxonomy.md`.

## Previous completed initiative

**Buyer Mobile PDP + native splash refinement — RELEASED to production 2026-09-02.**
Release PR **#613** (`develop → main`, merge commit `8b27d1a`, 11 commits / 28 files / +1,263 −501),
back-merged so `main == develop`. Deploy run `33614141448`: all 5 jobs green. Post-deploy health
verified — API `/v1/health{,/ready,/live}` 200 with `database: ok` (uptime 86s, confirming the swap),
and teka.cd / seller. / admin. all 200. **No migration, no new env var, no API/web/seller/admin change**,
so production behaviour is unchanged; the work reaches users only on the next store build.
App Store Connect privacy labels were corrected manually and are no longer outstanding.

The final follow-up in that initiative:
Removed only the monetary-savings message and moved the existing rating/favorite/share row below
stock status. Current/original prices, percentage badge, money format, actions, and business logic
are unchanged. All **231** Buyer Mobile tests pass; analyzer passes with six known info-level
deprecations. Rendered and inspected all discount/stock combinations on iPhone 16 Pro, plus long
titles, scrolling, SafeArea, and 2× text on iPhone SE. Favorite/review/native-share interactions were
verified with isolated fixtures; no production writes. No other surface, shared component, or splash
changes. Detail: `docs/buyer-mobile-pdp-splash-refinement.md` → "2026-09-02 targeted layout follow-up".

## Earlier completed initiative — buyer mobile PDP (pre-release state)

**Buyer Mobile PDP + native splash refinement — complete on `develop`, not released.** Buyer Mobile only:
the PDP breadcrumb is gone, the gallery/summary/sticky action/loading and responsive accessibility states
are refined, and native launch branding is sharp and proportionate on iOS and Android. Visual QA covered
iPhone 16 Pro, iPhone SE, and Android 14 against live read-only production catalog data. All **225** Buyer
Mobile tests pass, including cart-clear and address management; analyzer passes the repository gate with
six known info-only deprecations. No API, database, Buyer Web, seller/admin, route, analytics, cart,
checkout, address, or SEO changes. Detail: `docs/buyer-mobile-pdp-splash-refinement.md`.

## Earlier completed initiative — buyer cart and address

The buyer cart + single-address initiative shipped to production on 2026-09-01 and is closed — full
narrative in `PROGRESS.md`, detail in `docs/buyer-cart-sync-and-single-address.md`.

**Released 2026-09-01** — PRs #603, #604, #605, #607, #608 (+ #606/#609 docs) via release PR **#610**
(`develop → main`, merge commit `b331f85d`). Deploy run `33519392499`: all 5 jobs green.

**Both migrations are applied and verified in production. Nothing is outstanding.**

1. `2026-09-01_order_delivery_address_snapshot.sql` — auto-applied during deploy, recorded in
   `_manual_migrations` at 14:29:02Z (before the rolling swap). Backfill 9/9 orders.
2. `2026-09-01_archive_duplicate_buyer_addresses.sql` — run by hand via `Apply prod migration`
   (run `33554264282`, success). The one buyer holding 2 addresses now has exactly **1** active; the
   other row is **soft-deleted, not removed** (`deletedAt` set, still present, FKs intact).

**The snapshot earned itself immediately.** 6 of the 9 production orders pointed at the address the
archive step soft-deleted. They still read `Lubumbashi` from their own snapshot columns while the
buyer's only address is now `Kolwezi` — 0 orders lost a snapshot, 0 FKs broke. Reading through the FK,
as the code did before this initiative, would have silently rewritten six orders' delivery town.

**Post-release health:** API `/v1/health{,/ready,/live}` 200 (`database: ok`) · teka.cd, seller., admin.
200 · Sentry `teka-api` 5 unresolved, **0 since the deploy**; the three web projects 0 unresolved.

**Rollback for the archive step**, if ever needed:
`UPDATE addresses SET "deletedAt" = NULL WHERE id = 'a1adcebf-ed41-4a07-963f-73bfc11d31c1';`

## Open follow-ups (not blocking)

- **`rb7t4r` (Johnnie Walker) is BLOCKED on a business decision**, not on engineering. Teka has no
  restricted-product policy, no age-verification field or gate, no admin moderation for restricted
  goods, and no alcohol mention in the seller rules; the current taxonomy has no alcohol leaf (the
  June 2026 refactor dropped the legacy Bière/Vin/Spiritueux options, still visible at `seed.ts:844`).
  It sits on the intermediate « Supermarché > Boissons » with an incorrect `Type = Bière`. Decide
  whether to permit alcohol *with* the necessary policy/age/moderation controls, or prohibit it and
  archive the product.
- ~~**Manually-applied migrations are tracked nowhere central.**~~ **RESOLVED** —
  `apply-migration.yml` now records the filename in the same `_manual_migrations` table the
  auto-apply path uses, written only after the file succeeds. It also gained
  `ON_ERROR_STOP=1`, which it had been missing: psql exits 0 on SQL errors without it, so a
  half-applied migration used to print "✓ migration applied". Merged as `6dfaed6` (PR #621).
- ~~**Backfill of `_manual_migrations`.**~~ **COMPLETE — executed in production 2026-09-02
  20:26 UTC**, run `33679262957`, `INSERT 0 26`, via `Apply prod migration` from `main`.
  The table went **4 → 31** (4 auto-applied + 26 evidence-backed historical + the backfill's own
  self-record). Verified directly against the database, not inferred from a green check: all 26
  historical filenames present, self-record exactly once, the 9 unproven migrations still absent,
  no duplicates, and the two corrected timestamps intact
  (`2026-07-23_prune-non-leaf-attributes.sql` → 2026-07-24 19:55:00Z,
  `2026-09-03_remediate_legacy_category_products.sql` → 2026-09-02 18:41:42Z). Application tables
  unchanged: products 495, specs 337, brand_categories 314, categories 348, brands 51 — identical
  before and after. **Migration tracking is now operational and this initiative is closed.**
  One asymmetry worth knowing: the skip is **one-directional**. A hand-applied migration is
  recorded and a later auto-apply run skips it; the manual workflow has no pre-check and always
  re-runs the file it is given, by design. Safety there rests on the migrations being idempotent.
- **117 unreferenced legacy `ProductAttribute` rows** remain (of 200 suspects; the other 83 are
  referenced and must be preserved). Deliberately deferred until after the product remediation, which
  is now done — so this is unblocked whenever it is wanted.
- **Taxonomy debt on `vnkqce`:** it still displays « Type = Savon de lessive » because the Lessive
  leaf defines no equivalent `Type`; and Lessive exposes `Volume` although the product is sold by
  weight (1,5 kg), where `Poids` would fit better. Both belong to a systematic leaf-characteristics
  audit, not a one-off fix.
- **Brand coverage is thin where it matters least so far:** Maison & Cuisine has 25 of 26 leaves with
  no real brand, Supermarché 19/29, Mode 17/29. Absence of a brand is not automatically a defect —
  decide per product type which genuinely benefit before adding any.
- **Search analytics measured, deliberately not built:** production `SearchQuery` holds 53 rows over
  ~70 days (13/30d, 2/7d, 1/24h) — far too little to justify retention or aggregation infrastructure.
  **33 of 53 (62%) returned zero results**, which is the signal worth acting on when that workstream
  starts.
- **seller-mobile detail screen renders raw specification rows.** The API now returns the canonical
  de-duplicated set, so this is correct today; but the screen has no client-side guard of its own and
  the fix reaches devices only on the next store build.
- **buyer-mobile UI reaches devices only on the next store build.** The API and web changes are live now;
  the one-address rule is enforced server-side precisely so an older app build cannot bypass it. Old
  builds keep working — `POST /v1/addresses` still succeeds, it just upserts.
- **The on-device cart sequence was never verified on real hardware.** No UI automation was available
  (`osascript` denied assistive access, no `idb`/`cliclick`, no `integration_test/` harness). It rests on
  a `ProviderContainer` test proven to fail without the fix. Worth a manual pass on the next
  TestFlight/Play build; an `integration_test/` harness would close the gap for good.
- **Development DB drift — do NOT run `pnpm db:push` against it.** `prisma migrate diff` shows it would
  DROP `products.search_vector`, `products_title_trgm_idx`, `search_synonyms_terms_idx` and three foreign
  keys — search infrastructure created by manual SQL that `schema.prisma` does not model. Production is
  unaffected. Separately, dev was missing `2026-07-24_account_deletion_pending.sql` (buyer login 500'd
  locally until it was applied) — worth auditing dev against `auto-apply.list` generally.
- **CLAUDE.md headroom is thin.** The trim pass is done (`6cbf6a7`, 2026-09-01); the file now sits at
  ~38.7k chars against the 40k performance warning it documents. Prefer *replacing* stale text over
  appending — the next initiative that appends freely will trip the warning.
- **buyer-mobile `values-v33` splash themes keep `windowDrawsSystemBarBackgrounds">true`** while the four
  generator-managed theme files had it stripped in `c7207e5`. It is residue from the abandoned
  `fullscreen: true` config: `flutter_native_splash` writes that key and `windowFullscreen` from the
  *same* flag, and the hand-written v33 sidecars were copied off v31 before the cleanup (the generator
  knows nothing about v33, so it never corrects them). **Harmless** — `windowFullscreen` is what hid the
  status bar and it is gone everywhere; the Android 14 QA that validated the fix ran in the v33 bucket
  and was clean. Worth a two-line deletion for consistency with this tracker's own "keep the explicit
  status-bar keys absent" rule, plus a v33 assertion in `native_splash_assets_test.dart`.

## Previous initiative

**App Store 5.1.2(i) rejection + Android App Links never verifying** — **shipped to prod 2026-08-29**
(PRs #597 → develop, #598 → main/deploy, #599 back-merge, #600 version bump). **One operator step
remains, and it is not a code change:**

- **Fix the App Store Connect privacy labels** — set *Used to Track You* = **No** for every data type
  (matrix in `docs/mobile-release.md` → "App privacy"), reply to App Review, resubmit. The
  `PrivacyInfo.xcprivacy` that backs those labels is already in both binaries; it reaches devices on the
  next IPA build.

**Android App Links are FIXED and verified live.** `assetlinks.json` now carries both certs — Play App
Signing `43:ED:3F:…:6E:C4` (Play Store installs, which is how the failure was reported) and upload
`08:AC:B5:…:21:F4` (locally-signed release APKs). Confirmed after deploy against Google's Digital Asset
Links API (`digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://teka.cd`), which
returns both statements parsed cleanly. Remaining device check: `adb shell pm get-app-links
com.tootiye.teka` → `verified` (Android only re-verifies on install/update).

**Play Store release 0.1.5+7 built and ready to upload** (run `33274728803`, both apps). Signed AABs
downloaded to `~/Desktop/teka-aab-0.1.5+7/`; buyer cert verified to be exactly the upload key in
`assetlinks.json`, seller uses its own keystore as designed. Ships the accumulated work since `0.1.4+6`
(buyer 50 lib files, seller 27) — **not** the App Links fix, which was server-side only and needed no app
change. Upload is manual: Play Console → Test and release → track → Create release (two separate
listings).

**`Release mobile AAB` now works — it never had before.** Its first run (2026-07-04) and the first run
today both failed on the workflow's own guard (`upload keystore secret is not set — refusing to build a
debug-signed bundle`). The 8 Android signing secrets had been an open operator TODO since June. They are
now set for both apps from the local keystores (each verified to open with its stored credentials before
upload), so the workflow is repeatable from here.

**Root causes found.** (a) `assetlinks.json` shipped to production with the literal placeholder
`REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT` — an operator step from the 2026-06-28 deep-linking
initiative that was never completed. Android silently fails verification and falls back to the browser, so
**Android App Links never worked in production**; iOS was fine because Universal Links need no cert
fingerprint, which is why it looked Android-specific. (b) The Apple rejection was **not** a code defect —
the app genuinely does not track (no IDFA/AdSupport/ad SDK/data broker; Sentry errors-only, PostHog
first-party), so the privacy *labels* were simply wrong.

**Shipped:** both fingerprints in `assetlinks.json`; `PrivacyInfo.xcprivacy` for
**both** mobile apps (`NSPrivacyTracking=false`, empty `NSPrivacyTrackingDomains`) wired into the Runner
targets via the new idempotent `scripts/ios-add-privacy-manifest.rb`; regression guards
(`apps/buyer-web/src/lib/deep-link-association.test.ts` — proven to fail on the original placeholder — plus
`test/core/privacy_manifest_test.dart` in both apps); `docs/deep-linking.md` + `docs/mobile-release.md`.
**Deliberately not changed:** the Android manifest host list (adding `www.teka.cd` would break `teka.cd`
verification — `www` 301s to apex and Android's verifier doesn't follow redirects, and one failing host
fails them all on Android 12+).

**Gates:** buyer-web vitest 10 files/63 tests · buyer-mobile 202 · seller-mobile 42 · `pnpm type-check`
clean · `flutter analyze` 0 issues in `lib/`+`test/` for both apps.

## Closed 2026-07-30 — new-only catalog · internal stock · review titles + editing · PDP polish

Seven priorities, PRs **#580–#588, all merged into `develop`** (develop head `353033b`). Umbrella
tracker: `docs/new-only-stock-review-product-detail-fixes.md` (per-topic detail in
`docs/product-condition-deprecation.md` + `docs/review-title-and-editing.md`); full narrative in
`PROGRESS.md`. **Nothing has been merged to `main` — `origin/main` is still `4e2186b` (2026-07-25).**

**#580** pre-existing unpushed work, reviewed as its own PR because it had rewritten the target files ·
**#581** PDP cart icon (`push` → `go`; `/cart` is a shell-branch route and pushing one throws) ·
**#582 + #585** condition **deprecated, not dropped** (column/enum/API field and JSON-LD
`NewCondition` all stay; badge, État facet and seller selector gone) · **#583 + #585** exact stock is
internal — `En stock` / `Stock limité` / `Rupture de stock`, never a number; threshold audited at ≤5
(mobile had `< 5`, web `<= 5`) and centralised · **#584** nullable `Review.title` +
`PATCH /v1/reviews/:id` updating in place, title optional on create / required on edit ·
**#586** the current price keeps one colour whether or not discounted · **#587** seller info sits
immediately before the ratings, with an ordering test verified to fail on the pre-move file ·
**#588** docs.

Green on merged `develop`: API **243 unit + 118 e2e**, buyer-mobile **194**, seller-mobile **31**,
`pnpm type-check` clean, buyer-web lint 0 errors, `flutter analyze` 0 errors/warnings in `lib/`+`test/`
on both apps. Runtime verified on the **iOS Simulator** against live `api.teka.cd`.

**Not verified, by constraint rather than omission:** `xcrun simctl` has no tap or scroll (no
`idb`/`cliclick` on the host), so gesture flows — add to cart, checkout, favourites toggle, the stepper
cap message — are covered by widget tests rather than claimed; the Android emulator's DNS is broken;
and **review create/edit is unverified at runtime by standing decision — no review writes to production
from a personal account.** That one needs a test account with a delivered order, or a non-production
environment.

**Release:** promoting to `main` requires one prod migration —
`manual/2026-07-28_review_title.sql`, additive + idempotent, already listed in `auto-apply.list`, so
`deploy.yml` applies it **before** the rolling swap. No new env var. Deploy order + rollback are in the
tracker. **A `develop → main` PR has deliberately not been opened.**

> **DONE 2026-07-25 — buyer cart nav · notifications · help pages · account deletion · app-review login**
> (8 PRs #558–#564 merged to `develop`). Six device-reported buyer issues, each root-caused, web/mobile parity.
> Tracker: `docs/buyer-cart-help-notifications-account-deletion-review-login.md`; full narrative in `PROGRESS.md`.
> **#558** cart→PDP · **#559** help pages (Markdown + canonical contact + prod migration) · **#560** notification
> settings (dead toggle fixed on all 4 surfaces + OS-permission) · **#561** Notification Center persistence +
> backfill · **#562** account deletion (30-day pending; schema migration) · **#563** app-review login (env-gated,
> ships disabled) · **#564** docs. Merged develop verified green: API 226 unit + 116 e2e, buyer-mobile 139 +
> seller-mobile 12, web type-checks. Not device-verified (no device; cloud DB unreachable from the build env).
> **Remaining operator actions:** both prod migrations now **auto-apply during deploy** (listed in
> `prisma/migrations/manual/auto-apply.list`; `deploy.yml` runs them before the rolling swap — see `docs/deployment.md §5a`),
> so no SSH/manual SQL. Optionally run `backfill-buyer-order-notifications.ts --confirm` (data backfill). **App-review
> login:** the review phone `+243810000000` is set in the env files (enabled in dev; **prod stays
> `APP_REVIEW_LOGIN_ENABLED=false` — flip to `true` only during an active store-review window**, then off).

> **DONE (prior) — seller product images + category attributes.** See the note below (kept as history).

> **DONE 2026-07-24 — seller product images + attributes.** **(P1)** Empty image placeholder is now a
> tappable Semantic button opening the image manager (was inert; only "Ajouter" worked). **(P2)** Camera
> capture — French bottom-sheet chooser (Prendre une photo / Choisir dans la galerie); reuses compress→
> Cloudinary upload; iOS `Info.plist` gains `NSCamera`/`NSPhotoLibrary` usage strings (Android needs
> none). **(P3)** Wrong-category attributes root-caused: `getCategoryAttributes` merged self+parent+
> grandparent, so cooker attributes admin-added on the Informatique parent leaked into every monitor form.
> Fixed to **leaf-only** + admin guard (reject attributes on non-leaf categories) + a backward-compatible
> prune migration (unreferenced non-leaf attrs only). Verified on-device (camera→Cloudinary upload;
> Moniteurs shows only Taille écran/Résolution/Garantie) + API suite 209 green. **Operator:** apply
> `manual/2026-07-23_prune-non-leaf-attributes.sql` post-deploy (hygiene; API fix alone resolves the symptom).

> **DONE 2026-07-21 — seller-mobile submit / first-load / image-editing / notifications (4 PRs #550–#553, released to `main` via #554).**
Four seller-facing defects from a real device build + seller-web parity. Tracker:
`docs/seller-product-loading-images-notifications-fixes.md`. All fixed at source, minimal + backward-compatible,
**no DB/API-contract change**; API + all Flutter/web tests green (seller-mobile suite 11).

PRs (stacked, merge in order; retarget each base to `develop` as the prior merges):
`#550 submit-error` ← `#551 first-load-race` ← `#552 inline-image-edit` ← `#553 notifications`.

> **DONE 2026-07-21 — seller-mobile P1–P4.** **(P1)** "Soumettre pour révision" masked the API's real
> validation reason (0-image draft) behind a generic banner → now surfaces `friendlyErrorMessage` + a
> pre-flight empty-image guard with an "Ajouter" shortcut; seller-web list submit no longer swallows the
> error (+3 API submit specs). **(P2)** First-open Commandes/Produits error→retry was a cold-start race
> (list `StateNotifier`s fetched in constructors before auth) → each provider (orders/products/notifications/
> earnings/promotions/reviews) now starts loading + drives its first load off `authProvider.status` via
> `ref.listen(…fireImmediately)`, mirroring `dashboardStatsProvider`; removed the redundant home reload
> workaround (+provider test). **(P3)** Edit form had no image controls → extracted a shared
> `ProductImageManager` (add+delete, reused by `ProductImagesScreen`) embedded inline in the edit path;
> Cloudinary delete already swallows+logs (verified, no change) (+widget test). **(P4)** Diagnosed the empty
> Centre as the P2 race; fixed two proven gaps — seller `NotificationRouter` now routes plain broadcasts
> (`screen:'notifications'` → `/notifications`, parity w/ buyer) + settings screen now reflects real OS
> permission (new `PushService.getPermissionStatus()`; denied → guidance banner, notDetermined → request CTA);
> admin `ALL_SELLERS` audience already existed (+router test). **Remaining:** on-device runtime pass (needs a
> device/emulator) — steps in the tracker.

> **DONE 2026-07-04 — buyer-mobile nav/cart/search/checkout/town/rating fixes.**
> **(1)** Nav stack preserved on protected inline actions — `ensureAuthenticated` now `Future<bool>` that
> PUSHES login + awaits; verify screen pops back so the PDP keeps its back button and the action resumes
> in place (new `pushAuthFlowProvider` distinguishes push vs redirect; router post-auth redirect skipped in
> push mode). **(2)** Jumia-style PDP bar `[accueil | − | qté | +]` via new `cartItemProvider` (stock-capped,
> already-in-cart aware). **(3)** Search now surfaces brand + category chips (repo discarded `products`/`brands`).
> **(4, P0)** Checkout idempotency key is now a real v4 UUID (`uuid` dep) — was a non-UUID string the API
> rejected as "Erreur de validation"; shared `dio_error_messages` now prefers the field-specific message.
> **(5)** Town-mismatch warning (non-blocking amber card) on web + mobile from new quote flags
> (`fromTown`/`townMismatch`, additive). **(6)** Rating after delivery fixed — `canReview()` returns the
> eligible `orderId` (web POST also fixed) + "Noter le produit" entry on both order-detail pages. No DB
> migration. Tests: API 202/29 green (+reviews spec, +checkout town-mismatch cases); Flutter analyze clean
> +3 test files; buyer-web tsc clean.

> **DONE 2026-07-04 — iOS dSYM → Sentry + TestFlight CI/CD (on `develop`, verified end-to-end).** Wired the
> two missing iOS release gaps, mirroring the Android two-workflow split; no API/DB/web change, Android CI
> untouched. **(A)** `.github/workflows/build-mobile-ipa.yml` — macOS, app×flavor matrix,
> `flutter build ios --no-codesign` + `sentry_dart_plugin` **iOS dSYM → Sentry** for all 3 flavors (no
> signing infra). **(B)** repo-root Fastlane (`Gemfile`/`Gemfile.lock`,
> `fastlane/{Fastfile,Appfile,Matchfile,ExportOptions-{buyer,seller}.plist}`) — lanes `setup_signing` (match
> read-only + CI-only `Automatic→Manual` flip, never committed) + `upload_testflight` (ASC API key).
> **(C)** `.github/workflows/release-mobile-ipa.yml` — signed **production** IPA + dSYM (build job, auto) →
> `.ipa` artifact → **`ios-testflight` environment approval gate** → TestFlight upload. **Decisions (user):**
> signing = Fastlane `match` (`teka-ios-certs` repo; both apps share team `YK6Z393A4D` → one cert + a profile
> per bundle id); TestFlight = production only (dev/staging = build+dSYM artifact); approval =
> `workflow_dispatch` + protected environment. Committed pbxproj stays `Automatic` (local dev unaffected).
> **Operator setup done + match stores bootstrapped** (buyer+seller in `teka-ios-certs`; secrets + env +
> reviewer configured). **Verified end-to-end 2026-07-04:** run 28698644247 — both `build` jobs sign + build
> + dSYM→Sentry, gate approved, both `testflight` jobs uploaded to App Store Connect (run conclusion
> success). Four real-run fixes landed on `develop`: `persist-credentials:false` (GITHUB_TOKEN vs match-PAT
> header collision), explicit whitespace-stripped git auth for the private certs clone, absolute IPA path to
> `upload_testflight`, and auto-incremented epoch `CFBundleVersion` (TestFlight rejects duplicate build
> numbers). Docs: `docs/mobile-release.md` (pipeline + operator runbook) + `docs/sentry.md` (iOS dSYM).

> **DONE 2026-06-30 — Order Details & Admin Dashboard Improvements (5 phases, on `develop`).** On the managed
> workflow: **P1** API extensions — buyer order items += `product{id,slug,shortCode,status,city{slug}}`;
> `findProductForReview` seller += `status` + `sellerProfile{avgRating,totalReviews}`; admin `getDashboardStats`
> += `orderOps`. **P2** new **`/dashboard/sellers/[id]`** seller-detail page (reuses `/v1/admin/users/:id`);
> fixed+enriched the seller card on admin order detail (was blank — shape drift) + seller section on admin
> product detail, both clickable → seller detail; "Vendu par" per order line. **P3** dashboard "Opérations
> commandes" cards (6 managed buckets) + orders/returns `?status=` deep-links. **P4** buyer order products link to
> the PDP (web `productHref` + mobile `/products/{shortCode}`, "· Indisponible" when inactive, order intact).
> **P5** gates + docs. Found+fixed 3 latent shape-drift bugs (admin order/product seller sections were blank).
> Reused existing services; **no new endpoints, no migration**. Tracker: `tasks/order-admin-improvements-progress.md`;
> model: `docs/order-workflow.md`. Gates: **api 196 unit + 116 e2e**, 3 web type-check+build, both mobile analyze
> (0 lib errors) + buyer-mobile order tests; live-verified all new API contracts.

---

### Prior — **Managed Order Workflow** (shipped to prod 2026-06-29)

> **None.** (Managed Order Workflow — all 7 phases complete on `develop`, ready for the `develop → main` PR.)

> **DONE 2026-06-29 — Managed Order Workflow (7 phases, on `develop`).** Upgraded the order flow from
> seller-driven to **Teka-managed**: Teka collects from the seller → delivers → collects COD cash → 2-day return
> window → seller payout minus commission. **P0** schema + canonical state machine (+`READY_FOR_TEKA_PICKUP`,
> `RECEIVED_AT_TEKA`, `Order.deliveredAt/returnedAt`, `ReturnRequest`); admin owns delivery transitions; buyer
> cancel widened to {PENDING,CONFIRMED,PROCESSING} + restock-on-cancel. **P1** seller surfaces → "Prête pour
> collecte", dashboard status summary (`/v1/sellers/orders/stats`), product **town** column; removed seller
> ship/deliver. **P2** returns module + admin ops center (reçue/en livraison/livrée+encaissement, `/dashboard/returns`).
> **P3** buyer returns (`POST /v1/orders/:id/return`, 2-day window) + managed status labels. **P4** seller new-order
> **email + in-app + push** + return notifications + PostHog. **P5** **lazy return-window payout hold** (earnings
> eligible only `deliveredAt+2d`, computed on read; `walletBalanceCDF` non-authoritative) — runtime-verified on
> real Postgres. **P6** all-surface gates + docs. Tracker: `tasks/managed-order-workflow-progress.md`; model:
> `docs/order-workflow.md`. Gates: **api 194 unit + 116 e2e**, 3 web type-check+build, both mobile analyze (0 lib
> errors). Prod migration: `apps/api/prisma/migrations/manual/2026-06-29_managed-order-workflow.sql` (apply before deploy).

---

### Prior — **Order Management Workflow** (shipped to prod 2026-06-29, before the managed upgrade above)

> **None.** (Order Management Workflow — all 9 phases complete, shipped to prod.)

> **SHIPPED 2026-06-29 — Order Management Workflow (9 phases, develop→main).** Reported bug (confirmed orders not
> appearing) fixed in **Phase 2** (shipped early, release 2a24026): order-list endpoints emit
> `{ success, data: { data, pagination } }`; aligned the 4 mis-reading clients to `res.data.data` +
> `res.data.pagination` (buyer-web/seller-web/admin-web/buyer-mobile; seller-mobile was already correct). Order
> creation was always correct (DB-verified). **Phases 3-9:** audit confirmed the COD lifecycle / commission /
> snapshots already sound (+commission tests); buyer-web detail copy fix; **seller revenue breakdown** ("Votre
> rémunération": Revenu/Commission Teka %/Montant à recevoir) added to seller-web + admin-web ("Répartition
> financière") + seller-mobile via a shared `EarningsService.computeBreakdown` + API `financials`; buyer-mobile
> "Mode de paiement"; emails/push/PostHog already wired. Tracker: `tasks/order-management-progress.md`; model:
> `docs/order-workflow.md`. Gates: api 171 unit + 116 e2e, 3 web type-check+build, both mobile analyze;
> EMULATOR-VERIFIED buyer-mobile list + detail (TK-20260628-BBA3 = 123.500 FC).

> **SHIPPED 2026-06-28/29:** Mobile Image Preview + Dot-Separator Price Formatting (release #511) + buyer-mobile
> home-header overflow fix (#512) — both LIVE in prod. Model: `docs/delivery-fees-and-currency.md`.

> **SHIPPED 2026-06-28** — Delivery-Fee Correctness + CDF→FC (prod, releases #509 + hotfix #510). Backend BLOCKS on
> no-zone (city-based match); admin zone ×100/÷100 scaling fixed; CDF→FC everywhere. **Checkout double-wrap hotfix**
> (`quote()` returned `{data}` → double-wrapped → clients threw "Gratuit"/"Impossible") fixed + deployed. Model:
> `docs/delivery-fees-and-currency.md`. Follow-ups (user): prod zone-data audit · re-test checkout shows 4.000 FC.

---

### Prior initiative (paused) — **Buyer Web UI/UX Polish** (started 2026-06-25) — elevate buyer-web to modern-marketplace polish (refine, not
redesign): product cards (brand/savings/stock-emoji/seller-badge/ratings), header ☰, section emojis, hero overlay,
PDP (savings/COD-trust/seller-card/specs/reviews-CTA), footer. Mirror to buyer-mobile where sensible. **Tracker:
`tasks/ui-polish-progress.md`.**
- **2026-06-27 follow-up audit in progress:** marketplace taxonomy navigation + buyer-web/mobile category discoverability,
  plus cart/profile/notifications/mobile-copy polish. Tracker: `tasks/buyer-ui-ux-progress.md`. Completed: web type-check/build,
  local browser verification, and Android production-flavor guest smoke against `https://api.teka.cd`. NEXT: checkout, PDP,
  authenticated account/order states, and deeper mobile authenticated flows.
- **2026-06-27 seller follow-up audit in progress:** seller-web responsive dashboard shell/cards + seller-mobile shell/copy polish.
  Tracker: `tasks/seller-ui-ux-progress.md`. Completed: seller-web type-check/build and local mobile auth-route smoke;
  live authenticated seller-web audit with provided seller credentials; reviews/promotions product response compatibility and earnings
  error copy fixed. Seller-mobile production APK builds but emulator install is blocked by insufficient storage. NEXT: seller-mobile launch
  on a clean/free-space emulator and authenticated mobile flow review.
- **Phase 1 audit ✅ DONE. All 4 rounds shipped to develop:** R1 cards #490 (brand/savings/🔥stock/Officiel
  badge + additive API `brand` field + mobile parity) · R2 chrome #491 (☰ Catégories, section emojis, hero
  overlay/CTA) · R3 PDP #492 (COD trust block, seller Officiel/Vérifié, reviews CTA, related→carousel + mobile
  parity) · R4 footer #493 (social icons @tekardc + Google Play badge).
- **▶ NEXT (gated on user):** (a) confirm the Google Play link (`com.tootiye.teka` published?) — else drop it;
  (b) release rounds 1–4 to prod (code-only). Optional later: desktop PDP image-zoom-on-hover (deferred).

> **Product Lifecycle Management** SHIPPED to prod (release #478, 2026-06-24) — `+SUSPENDED` + audit log; migration
> applied. Mobile on next AAB. `docs/architecture.md` → "Product Lifecycle"; `tasks/product-lifecycle-progress.md`.
- **✅ ALL PHASES SHIPPED to develop.** Decisions (locked): +`SUSPENDED` enum (out-of-stock derived; DELETED=
  `deletedAt`) · ACTIVE content edit → re-review (value-compared) · skip SKU + add `ProductStatusLog`.
  - **#473 (API):** migration (+SUSPENDED + `product_status_logs`); seller withdraw/restore/duplicate + re-review
    + search; admin suspend/restore/archive/soft-delete/history + multi-field search; status-log + analytics.
  - **#474 admin-web** (search + lifecycle actions + history) · **#475 seller-web** (search + withdraw/restore/
    duplicate + ACTIVE content-unlock w/ re-review banner) · **#476 seller-mobile** (parity). Buyer: no change
    (SUSPENDED auto-excluded; out-of-stock UX already done).
  - 163 unit + 116 e2e + mobile tests; all apps build/analyze clean.
- **Remaining before prod (gated): the migration** `2026-06-24_product_lifecycle.sql` (+SUSPENDED enum value +
  `product_status_logs`) ships via the Apply-migration action at release. Mobile on the next Play Store AAB.
  Noted follow-up: seller-mobile inline content-edit of ACTIVE products (full D2 web parity) — mobile keeps
  archive→edit→resubmit for now.

> **Advanced Search** SHIPPED to prod (release #466, 2026-06-24): synonyms + ranking + logging + autocomplete +
> filters; migration applied (8 synonym groups; gsm→phones live). Mobile on next AAB. `docs/architecture.md` →
> "Search engine"; history: `tasks/search-progress.md`.
> **Seller-login-after-upgrade** FIXED + shipped (release #472): the prod seed no longer clobbers an existing
> seller password (`credentialsForSeed` guard + test). `docs/deployment.md §5b`.

> **Catalog Architecture Refactor** SHIPPED to prod (release #460, 2026-06-24). 3-level taxonomy (Category →
> Subcategory → Product Type, reused Category tree); 7 cats / 35 subs / ~145 types / ~360 attrs / 49 brands;
> Construction+Automobile removed; **prod data migrated — 9/9 real products remapped, 0 cruft, deploy green**.
> main==develop. Mobile selectors/drill-down ship on the next Play Store AAB. Model: `docs/architecture.md` →
> "Marketplace taxonomy + brands"; history: `tasks/catalog-refactor-progress.md`.

> **Universal Deep Linking** shipped (release #451; #446–#450 + iOS push config #444/#445). Operator-pending: real
> Play-signing SHA-256 in `assetlinks.json`; iOS Associated Domains capability on a signed device. Model:
> `docs/deep-linking.md`. Broadcast notifications shipped to prod (release #443, see below).

> **Buyer iOS push — config wired + build-verified 2026-06-23, device/Apple steps remain.** Prod
> `GoogleService-Info.plist` (`com.tootiye.teka`) in `apps/buyer-mobile/ios/Runner/` (gitignored; secret
> `BUYER_GOOGLE_SERVICE_INFO_PLIST_B64`). Automated + verified by `flutter build ios --no-codesign` (Runner.app
> built, Firebase SPM-linked): bundle id aligned `buyerMobile→teka`, `UIBackgroundModes`, `Runner.entitlements`
> (`aps-environment`) + `CODE_SIGN_ENTITLEMENTS`, plist in Copy-Bundle-Resources, deployment target 13→15 (Firebase
> req), SPM integrated. **Remaining (device/Apple, not automatable):** upload APNs `.p8` (Key ID `78KG84553N`,
> Team ID `YK6Z393A4D`) to Firebase Console; sign for `com.tootiye.teka`; real-device/TestFlight install + live
> push test; commit the untracked `ios/` tree ("PR C"). Full checklist: `docs/push-notifications.md` → iOS.

### Recently completed — 2026-06-23 (Broadcast notifications — SHIPPED to prod, release #443)
Admin→buyers notifications as **push + a persisted in-app Notification Center** across API + admin-web +
buyer-web + buyer-mobile. 5 phased PRs #438–#442 → release #443 (`develop→main`, `0ea66d1`, main==develop);
prod migration `2026-06-23_broadcast_notifications.sql` applied via the Action (productId/recipientIds cols +
BROADCAST/PRODUCT_PROMO enum values confirmed on prod); prod-smoke verified (feed + admin endpoints 401-gated,
browse 200, `/notifications` 200). Tracker: `tasks/broadcast-notifications-progress.md`; model:
`docs/architecture.md` → "Notifications & broadcasts". Mobile reaches devices on the next Play Store AAB.
  iOS push deferred (no GoogleService-Info.plist). Optional: before/after screenshots (needs running apps).

### Recently completed — 2026-06-23 (Discount system + product-card UX — SHIPPED to prod, release #437)
Per-product seller-set discount price across API + all 4 frontends + card cleanup + `/promotions` discovery.
6 phased PRs #431–#436 → release #437 (`develop→main`, `d40d38e`, main==develop); prod migration
`2026-06-23_product_discount_price.sql` applied via the Action (4 cols confirmed); prod-smoke verified (browse/
onPromotion/PDP/`/promotions` all 200, discount fields flow, no 500). Tracker: `tasks/discount-system-progress.md`.
Deferred: seller-mobile edit-after-publish for ACTIVE (seller-web covers it). Optional: prod re-seed to surface
demo discounts (prod currently 0 on-promo). Mobile reaches devices on the next Play Store AAB.

### Recently completed — 2026-06-23 (Localization removal sweep — SHIPPED to prod, release #430)
French-only platform: next-intl removed from all 3 web apps (#428 admin + #429 seller/buyer), gen-l10n removed
from both Flutter apps (#424/#426/#427), and the legacy `{fr,en}` JSONB data-shape eliminated (parsers + stale
admin types + dead `shared/constants/locales.ts`; dev DB backfilled via
`2026-06-23_translatable_jsonstring_to_fr.sql`, prod already clean). Released `develop→main` #430 (`4767128`,
main==develop), deployed + prod-smoke-verified (French renders, 0 raw JSON, attribute names plain). No
multilingual machinery remains. **Operator step still pending:** run "Release mobile AAB" + upload to Play
Store so the buyer-mobile redesign (Steps 1–3) reaches devices — `docs/mobile-release.md`.

### Recently completed — 2026-06-23 (Buyer-mobile Step 3 — shared states — SHIPPED to main)

Step 3 of the buyer-mobile redesign (release #426). New `lib/core/widgets/` `AppEmptyState`/`AppErrorState`
+ dependency-free `ShimmerBox`/`ProductCardSkeleton`/`ProductGridSkeleton`/`ProductRowSkeleton`; wired into
home/category/search/wishlist/orders/cart (content-shaped skeletons for product grids/rows; consistent empty/
error with retry); all product grids unified to `kProductCardAspectRatio = 0.62`; removed unused `_Empty*View`s.
The audit's "raw `state.error!`" was already fixed (providers map via `friendlyErrorMessage`/
`extractDioErrorMessage`). No API/DB. analyze 0 errors; 93 tests; device-verified.

---

### Recently completed — 2026-06-23 (Buyer-mobile navigation overhaul + redesign — SHIPPED to main)

**Buyer-mobile UX/UI redesign + navigation overhaul** — 2 PRs, released `develop → main` (#424, `develop ==
main` @ `716362a`). **No API/DB/migration; buyer-mobile only.** Mobile changes reach devices on the next
**Play Store AAB** build (web/api unaffected by this deploy). Tracker: `docs/buyer-mobile-redesign.md`.
- **Step 1 — l10n removal (#422):** French-only platform → removed the gen-l10n/`AppLocalizations` machinery;
  ~272 `l10n.*` calls across 27 files inlined as French literals; deleted `lib/l10n/` + `locale_provider.dart`
  + `l10n.yaml`; dropped `generate: true` + the delegate (framework `GlobalMaterialLocalizations` stays `fr`);
  CI gen-l10n step guards on `l10n.yaml`; **CLAUDE.md Rule 1 rewritten** so this stops recurring.
- **Step 2 — bottom-nav shell + redesign (#423):** `StatefulShellRoute.indexedStack` bottom nav (Accueil ·
  Categories · Favoris · Panier · Compte, cart badge, one navigator per tab); Search = Home search bar (not a
  tab); Orders → under Compte; new Categories tab grid + Notifications screen; **white** AppBar (brand + town
  pill + bell) replacing the red 6-icon header; **Favorites back-button bug fixed by construction**
  (top-level tab — old cause: `context.go(returnTo)` replacing stack to `[Wishlist]` root vs `push` keeping a
  parent); guest→protected-tab→login gains a ✕ close (never stranded); red rebalanced to CTAs/accents.
  Preserved APIs/business-logic/analytics (PostHog `$screen` via per-branch `PosthogObserver`)/auth/
  town-architecture/guest gates. analyze 0 errors; 93 tests; device-verified on emulator (prod flavor, Kolwezi).
- **Deferred (Step 3, not started):** product-card polish + shared skeleton/empty/error widgets + push
  error-mapping into shopping providers. **Operator step:** run "Release mobile AAB" + upload to Play Store
  for the redesign to reach real devices.

---

### Recently completed — 2026-06-22 (Mobile guest browsing + enterprise error handling — SHIPPED)

**Mobile guest browsing + enterprise error handling** — two parts, P1 #417 + P2 #418, released `develop ==
main`. **No API/DB/migration.** Full tracker: `docs/mobile-guest-and-errors.md`.
- **P1 — Guest browsing (buyer-mobile):** root cause = `app_router.dart` forced every guest to login (browse
  APIs already public). Selective router gate (city-first for everyone; only cart/checkout/orders/wishlist/
  profile require auth, with `returnToRouteProvider`); `ensureAuthenticated()` on inline actions; guest-safe
  home (badges/heart/city-sync skip auth-only calls). **Device-verified:** launch→city→browse as guest, 0
  auth-only calls / 0×401, protected tap → OTP login + return.
- **P2 — Error handling (buyer + seller):** root cause = auth providers/screens set `error: e.toString()` (raw
  `DioException` to users); mapper bypassed; seller had none. Upgraded `dio_error_messages.dart` (both apps,
  identical): friendly FR per category, prefer-API for business 4xx, never `.toString()`; replaced all ~23 leak
  sites; `friendlyErrorMessage` auto-captures only UNEXPECTED errors to Sentry (endpoint/status/type + userId
  id+role + active city); PostHog auth events (`auth_otp_requested`/`auth_login_success|failure` + category);
  hardened `PosthogAnalytics._enabled`. analyze 0 errors/warnings; buyer 93 + seller 3 tests.
- **Decisions:** guest cart = gate-on-action (no local cart); error text = prefer-API + friendly generics.
- **Ships to devices on the next Play Store build (buyer + seller AABs).** Follow-up (optional): shared
  retry-error widget; guest-cart-merge if desired later. **No other follow-up.**

---

### Recently completed — 2026-06-22 (Town switcher fix + town-selection UX — SHIPPED + VERIFIED on prod)

**Town switcher fix + town-selection UX** — the header "Livrer à {city}" selector did nothing on non-home
pages; it only opened after navigating back to `/`. PR #415 → release #416 (`develop == main` @ `5036e7f`).
**Root cause:** `<CitySelectorModal />` was mounted in `home-page.tsx` only, while the header (global) just
flips the `showSelector` store flag → no modal mounted on PDP/category/search to render it. **Fix:** mounted the
modal once in `app/layout.tsx` (global; renders `null` until opened → no SSR footprint), removed the homepage
mount; **redesigned** it (compact, searchable for 50+ towns, province grouping, town-accent selected state,
full a11y, mobile bottom-sheet); added **smart centralized town-switch routing** (`lib/town-switch.ts`
`resolveTownSwitchUrl` + `lib/use-select-town.ts` — category → same category in new town, else `/{newSlug}`;
modal + `CityPrompt` both go through it). buyer-mobile: searchable city screen (scalability parity; no bug
there). **No API/DB/migration.** Full tracker: `docs/town-switcher-ux.md`.
- **Prod verified (2026-06-22):** deploy success; SSR non-regression (`/`, `/lubumbashi`, `/categories`, real
  PDP → 200, **0** `role="dialog"` in raw HTML); new modal strings live in the served payload. web 54 tests +
  mobile 84 tests green. **Known follow-up (pre-existing, out of scope):** cold deep-links to category/PDP
  don't yet adopt the URL town into the header (only `/{ville}` landing does). **No other follow-up.**

---

### Recently completed — 2026-06-22 (City landing hero parity — SHIPPED + VERIFIED on prod)

**City landing hero parity** — `/{ville}` city pages now use the homepage's premium hero. PR #411 → release
#412 (`develop == main` @ `f50105f`). **Root cause:** two divergent hero implementations (homepage = inline
image hero in the `BannerCarousel` fallback; city page = its own flat red-gradient `<section>`). **Fix:**
extracted a shared **`StoreHero`** (`components/home/store-hero.tsx`) — single source of truth (town image +
accent badge + H1 + subtitle + CTA + trust strip). Homepage uses it as the BannerCarousel fallback (unchanged);
city page renders it **directly** so the city `<h1>` stays in SSR HTML (BannerCarousel's loading skeleton would
push it client-only — SEO regression avoided). Copy is **template-driven** (`cityLandingTitle/Subtitle` +
`city.name`); image/accent from the data-driven `City.heroImageUrl`/`accentColor` → a new town auto-gets the
hero with **zero code + zero per-city data** (decision: template, not new DB columns). **buyer-mobile:** new
`CityHero` widget on the home (bundled `assets/hero/<slug>.jpg` for Lubumbashi/Kolwezi + accent-gradient
fallback), same templated copy. **No API/DB/migration.**
- **Prod verified (2026-06-22):** `/lubumbashi` + `/kolwezi` ship `<h1>Achetez en ligne à {city}` + subtitle +
  hero image + trust strip in **raw SSR HTML** (indexable); metadata already city-specific; all pages 200.
  **Initiative fully shipped + verified — no follow-up.**

---

### Recently completed — 2026-06-21 (Category image tiles — SHIPPED + VERIFIED on prod)

**Category image tiles** — emoji category cards → real product-photo icons (circle + label) on buyer-web +
buyer-mobile. PR #409 → release #410 (`develop == main` @ `30400bb`). **Bundled static assets keyed by category
slug** (`public/categories/<slug>.png` web · `assets/categories/<slug>.png` mobile, 256px), emoji fallback for
subcategories / future categories — chosen over a DB/Cloudinary field because the 7 top categories are a fixed
taxonomy and bundling is faster + offline-friendly on DRC 2G/3G. No API/DB/migration.
- **buyer-web:** `lib/category-images.ts` + `components/category/category-icon.tsx`, used by home-page,
  city-landing-page, all-categories page (dropped the bordered card for a clean circle + label).
- **buyer-mobile:** `category_images.dart` + `category_circle.dart` (circle+label strip replaces the home pill
  strip), `CategoryModel.slug`, `pubspec.yaml` assets entry. *(Mobile change ships to devices on the next
  Play Store build — web is live now.)*
- **Prod verified (2026-06-21):** all 7 icons serve `200 image/png` on teka.cd; homepage + `/lubumbashi` +
  `/categories` all 200. **To add a future category icon: drop `<slug>.png` in both asset dirs + one map line.**
  **Initiative fully shipped + verified — no follow-up.**

---

### Recently completed — 2026-06-21 (Town Architecture Refactor — SHIPPED + VERIFIED on prod)

**Town Architecture Refactor** — scalable, Amazon-style town selection across all 4 apps + API. Shipped as
4 phased PRs (#404 P0, #405 P1, #406 P2, #407 P3) → release #408 (`develop == main` @ `3cd278e`); two prod
migrations applied via the Action. Full tracker: `docs/town-architecture-refactor.md`.

- **P0 — API/DB:** `City.accentColor`/`heroImageUrl` (data-driven towns), `User.preferredCityId` + `PATCH
  /v1/users/me/preferred-city`, `/me` carries the resolved `preferredCity`; seller-profile update accepts
  `cityId`. Migration `2026-06-21_town_architecture.sql` (columns + FK + index).
- **P1 — buyer-web:** Amazon-style header town selector ("Livrer à / {ville}"), **SEO-safe first-visit modal**
  (client overlay over SSR content, cookie-gated), persistence to **cookie + localStorage + profile**, homepage
  "Achetez dans votre ville" section removed → crawlable `/{ville}` links moved to the footer, data-driven
  accent/hero (`lib/city-accent.ts` reads city data — no slug switch). Backfill migration
  `2026-06-21_town_identity_backfill.sql` (Lubumbashi=copper / Kolwezi=cobalt + hero as data).
- **P2 — buyer-mobile:** profile hydration (`hydrateFromProfile` via `ref.listen(authProvider)`) + `PATCH
  preferred-city` sync + data-driven `TekaColors.cityAccent`. First-launch gate already existed.
- **P3 — seller apps:** seller-web + seller-mobile profile **city picker** (existing `SellerProfile.cityId`,
  `/v1/cities`); `location` kept as free-text address detail. Sellers don't browse by town (D4).
- **Decisions:** D1 SEO-safe auto-modal · D2 `User.preferredCityId` · D3 promos/banners/categories stay global
  (products+search already town-scoped) · D4 buyer apps select town / sellers get a profile city picker.
- **Prod verified (2026-06-21):** `/v1/cities` returns `accent=copper/cobalt` + hero; `PATCH …/preferred-city`
  live (401 unauth, not 404); teka.cd + `/lubumbashi` + seller/admin + api all 200. `develop == main`.
  **Future towns are now config-only** (set `accentColor`/`heroImageUrl` on the City row — no code change).
  **Initiative fully shipped + verified — no follow-up.**

---

### Recently completed — 2026-06-21 (Buyer experience visual redesign — SHIPPED to prod)

**Buyer experience visual redesign** — Phase 1 (buyer-web) release #398, Phase 2 (buyer-mobile) release #401,
Phase 3 (seller-web/admin-web/seller-mobile) brand-consistency pass. Modern Ruby red `#C8102E` + copper/cobalt
town accents (buyer surfaces only). Token-driven, low-risk; no SEO/analytics/API/server-page changes. Full
tracker: `docs/buyer-web-redesign.md`. `develop == main` @ e4743f0. **Initiative complete across all surfaces.**

---

### Recently completed — 2026-06-21

**Dependabot joi 17 → 18.2.1** (#367 → release #396) — major bump; verified against current code (PR CI was
stale): type-check + 129 unit + 116 e2e green, post-merge develop CI green, prod deploy healthy (joi runs the
env-validation schema at boot). `develop == main`. Other open Dependabot PRs remain (multer 2.2.0, form-data,
protobufjs) + 9 flagged vulnerabilities — triage when convenient.

---

### Previously — Seller Product Management UX (SHIPPED + VERIFIED on prod 2026-06-18/21)

**Seller Product Management UX** — two usability gaps, shipped as PRs #392 (searchable category selector) +
#393 (seller approval/rejection notifications: per-user `UserNotification` model + in-app + push + email),
released #394, migration `2026-06-18_user_notifications.sql` applied. Full narrative in PROGRESS.md (Jun-18).

Prior initiative (*Admin product notifications + seller session/auth isolation* + refresh-cookie hotfix) is
**SHIPPED + VERIFIED on prod 2026-06-18** (`develop == main` as of those releases) — see below.

---

### Recently completed — 2026-06-18 (SHIPPED + VERIFIED on prod)

**Admin product notifications + seller session/auth isolation.** Two prod defects from live testing — shipped
as 3 PRs (#385, #386, hotfix #388) across releases #387, #389 (+ main→develop back-merge). Full narrative:
`PROGRESS.md` (Jun-18). Reference: `docs/session-management.md`.

- **Issue 2 — sellers logged out after creating a product. TRUE ROOT CAUSE (hotfix #388 → release #389):**
  `RefreshTokenDto.refreshToken` was required, so the global ValidationPipe **400'd every cookie-based `{}`
  refresh BEFORE the controller's cookie-fallback ran** → web auto-refresh never worked → logout the moment
  the 15-min access token expired mid-session (e.g. during image uploads — exactly the reported flow). Fix:
  mark the field `@IsOptional()`. **Reproduced locally** (JWT_EXPIRY=5s: /refresh cookie+`{}` 400→200, /me
  recovers) + regression test `refresh-token.dto.spec.ts`. **Verified on prod** (refresh now reaches the
  handler). Mobile (sends `{refreshToken}`) unaffected.
- **Issue 2 — adjacent hardening (#385 → release #387):** refresh rotation **15s grace window** (no
  revoke-all on benign races; uses existing `revokedAt`, no migration); **per-surface cookies**
  `teka_{admin,seller,buyer}_{access,refresh,session}` (via `X-Teka-Surface`; `auth/surface.util.ts`);
  **scoped logout** (current `jti`); `apiFetch` FormData-aware + all authed raw fetches routed through it;
  `fetchUser` nulls only on genuine 401; Sentry breadcrumbs. **Cookie rename forced a one-time re-login** for
  active web users on deploy (expected, done).
- **Issue 1 — admins unaware of new products (#386 → release #387):** `AdminNotification` model + enum (prod
  migration `2026-06-18_admin_notifications.sql` **applied via the Action**); `AdminNotificationService`
  emits `PRODUCT_SUBMITTED` on `submitForReview`; `pendingProductsCount` in admin stats; admin notification
  endpoints; admin-web sidebar badge + dashboard alert + header `NotificationBell`. Admin has no mobile app →
  no mobile parity.
- **Green:** api 119 unit + 112 e2e; buyer-web 51; admin-web type-check + prod build. **Initiative fully
  shipped + verified — no follow-up.**

---

### Recently completed — 2026-06-14 (Marketplace Taxonomy — SHIPPED TO PROD)

**Marketplace Taxonomy, Dynamic Attributes, Brands & Catalog Reset** — 8 phases, **16 PRs #368–#383, all
merged**. Strict **2-level taxonomy** (7 categories → 80 subcategories, `apps/api/prisma/taxonomy-data.ts`),
first-class **Brand library** (CRUD/merge/activate; `Product.brandId`; buyer brand-filter facet), per-subcat
**dynamic attributes** (incl BOOLEAN; admin BOOLEAN/option-editor/reorder), and pre-launch **catalog-reset
tooling** (`pnpm db:reset-catalog` + admin hard-delete). Seller create/edit (web+mobile) get a brand dropdown
+ BOOLEAN field; buyer search (web+mobile) gets a brand facet + BOOLEAN facet; product JSON-LD emits the real
brand. Decisions D1 first-class brandId · D2 keep JSON attribute options · D3 re-seed demo catalog.
Detail: `PROGRESS.md` (Jun-14 entry) · `docs/architecture.md` → "Marketplace taxonomy + brands" ·
`tasks/marketplace-taxonomy-progress.md`.

**▶ PROD ROLLOUT — DONE (2026-06-14, release #384):** `develop→main` merge → deploy (api + 3 web) →
**applied** migration `2026-06-14_taxonomy_brand_foundation.sql` (Apply-prod-migration Action) → **ran** prod
seed (Run-prod-seed Action: deactivated 116 prior cats; seeded 7 cats / 80 subs / 160 attrs / 51 brands /
121 links / 152 demo products). **Catalog reset skipped** (reconciling seed handled the demo catalog —
nothing irreversible run). **Verified live on prod:** 7 active top cats + 80 subs, 51 brands, Smartphones→12,
brand filter (Prisma + FTS), BOOLEAN attr "Sous garantie", PDP JSON-LD `"brand":{"@type":"Brand","name":
"Tecno"}`, sitemap strict slugs, admin/seller/buyer pages 200. **Initiative fully shipped + verified — no
follow-up.**


### Recently completed — 2026-06-10 (operator action pending)

**Mobile release readiness (Android / Play Store launch prep)** — shipped to `main` (#365/#366). **Code +
tooling complete; OPERATOR TODO remains:** generate the 2 upload keystores, set the 8 signing secrets,
finalize prod `google-services.json`, run "Release mobile AAB" → upload to Play. Full runbook:
`docs/mobile-release.md`. Details:
- `apps/{buyer,seller}-mobile/android/app/build.gradle.kts` — a release `signingConfig` that loads
  `android/key.properties` (gitignored) and signs the release build with the upload key; **falls back to
  debug** when absent (local dev / internal APK builds unaffected).
- `scripts/sync-android-signing.sh` — decodes the keystore + writes `key.properties` from env/secrets
  (mirrors `sync-firebase-secrets.sh`).
- `.github/workflows/release-mobile-aab.yml` — "Release mobile AAB": signs + builds the **production
  release App Bundle** (`flutter build appbundle`), **fails fast if signing secrets are missing**, verifies
  the bundle is **not** debug-signed, uploads the `.aab` artifact. Per app (buyer/seller, separate
  keystores).
- `docs/mobile-release.md` — keytool commands, the GitHub Secrets table, version-bump + build steps, and a
  full **Play Store submission checklist**. CLAUDE.md docs index + the APK-workflow note updated.
~~**OPERATOR TODO (not code):** generate the two upload keystores, set the 8 signing secrets, finalize the
production `google-services.json` per app, then run "Release mobile AAB".~~ **DONE 2026-08-29** — keystores
were generated 2026-07-01; the 8 signing secrets were set from them on 2026-08-29, and "Release mobile AAB"
succeeded for the first time (run `33274728803`, 0.1.5+7, both apps). Play Console upload stays manual.
**Still out of scope:** automated Play Console upload.

**Initiative #1 — Real Catalog & Merchant Supply is now FULLY CLOSED** — P3c (demo-catalog
retirement) SHIPPED + VERIFIED on prod 2026-06-09 (release #363; prod seed run created the
`RETIRE_DEMO_CATALOG`/`DEMO_RETIRE_THRESHOLD` rows). Ships **dormant** — verified on prod: browse still
returns 188 products (demo visible), a demo product detail reports `isRetired=false`, its PDP returns 200
(no 301). When the operator flips the master switch (admin → catalog-coverage), demo in covered categories
(≥ threshold real products) hides + 301s to the category. **Remaining work is operational** (recruit real
merchants, then enable retirement) — no code. No in-flight build work; ask the user what to start next.

**Initiative #1 — P3c — demo-catalog retirement: SHIPPED + VERIFIED on prod 2026-06-09 (release #363).**
**Goal:** once real merchants populate categories, HIDE the seeded demo catalog + 301 its product URLs to
the category page. Decisions: **per-category automatic** retirement (a master switch enables it, then each
category auto-retires its demo once it has ≥ `DEMO_RETIRE_THRESHOLD` real ACTIVE products — store never
empties); retired demo PDPs **301 → category page**; **ships DORMANT** (master switch `RETIRE_DEMO_CATALOG`
default false → zero change to today's demo-only prod). Hide = exclude via filter (keep `isDemo` rows,
reversible). No migration (flag + settings KV already exist). **CODE-COMPLETE on `develop` (#359–#362), PENDING
RELEASE.**
- **P3c-1** (#359, API): `getRetiredCategoryIds` (reads `RETIRE_DEMO_CATALOG` + `DEMO_RETIRE_THRESHOLD`,
  default-safe; groupBy real counts ≥ threshold) + `(isDemo=false OR categoryId NOT IN retired)` filter on
  browseProducts (both branches), searchSuggestions, getRelatedProducts; `isRetired` on getProductDetail; 2
  seed settings; 2 unit tests. Sitemap inherits the filter.
- **P3c-2** (#360, buyer-web): PDP server component 301s a retired demo product to its category
  (`permanentRedirect` → `categoryHref`).
- **P3c-3** (#361, admin-web): retirement toggle + threshold on the catalog-coverage page + per-category
  "Démo retiré / En attente du seuil" status.
- **P3c-4** (#362, docs): retirement model in `architecture.md`; STATUS.
**RELEASED (release #363, 2026-06-09):** P3c-1…4 shipped develop→main, deployed, prod seed run (success)
created the two setting rows. **Verified on prod (dormant):** api + storefronts 200; browse total 188 (demo
visible); demo product `isRetired=false`; demo PDP 200 (no 301). `develop == main`. **Operational
follow-up (not code):** flip `RETIRE_DEMO_CATALOG` on (admin → catalog-coverage) once real merchants
populate categories.

**Initiative #2 — Discovery & Conversion is FULLY SHIPPED** (A best-seller ranking, B search +
autocomplete, C related + attribute filters, D conversion polish) — all live + verified on prod. Phase D
(conversion polish) SHIPPED + VERIFIED on prod 2026-06-09 (release #358) — details below. No in-flight
build work; ask the user what to start next. Recent candidates: Initiative #1 P3c (demo-catalog retirement,
deferred pending real merchants), or a fresh initiative.

**Initiative #2 Phase D — conversion polish: SHIPPED + VERIFIED on prod 2026-06-09 (release #358; no
migration — pure UI + client state).** Decisions: scarcity = exact count "Plus que X en stock" (qty ≤ 5);
quick-add = always-visible button (qty 1); recently-viewed on home + PDP, **client-local only** (persisted
view-tracking out of scope). 6 sub-PRs:
- **D-1 scarcity** (#352 web, #353 mobile): "Plus que X en stock" badge on cards + PDP warning; mobile
  `productLowStock` parameterized to the exact count.
- **D-2 quick-add** (#354 web, #355 mobile): always-visible add-to-cart on listing cards (qty 1, disabled
  out-of-stock, toast/snackbar), reusing cart addItem (so `add_to_cart` analytics fire); ripples across all
  grids via the shared card; card click still navigates (button outside the link / wins its own tap).
- **D-3 recently-viewed** (#356 web, #357 mobile): client-local store (localStorage / SharedPreferences,
  capped 12, deduped), captured on PDP view, "Vus récemment" strip on home + PDP (PDP excludes current).
**Prod verify:** api + all 3 storefronts + a PDP all 200; `teka_recently_viewed` literal confirmed in the
deployed buyer-web JS bundle. Full local sweep green: api 79 unit + 108 e2e; buyer-mobile 76 + seller-mobile
3 (0 analyze errors); buyer/seller/admin-web tsc clean. **Behavioral notes:** scarcity badge only shows for
qty ≤ 5 (no low-stock items in the current sample catalog, so absent by design); recently-viewed populates
after the buyer views products (client-local). `develop == main`.

Initiative #3 (Seller Payouts Operationalization) SHIPPED + VERIFIED on prod 2026-06-08 (release #351) —
see below.

---

**Initiative #3 — Seller Payouts Operationalization** (started 2026-06-08, **SHIPPED + VERIFIED on prod
2026-06-08, release #351**). **Goal:** make seller payouts
operationally complete end-to-end on the COD platform — sellers accrue `walletBalanceCDF` on delivery but
today **cannot get paid** (completion flow unimplemented; seller request UI deliberately disabled).
**Settlement model RESOLVED (user, 2026-06-08):** Teka couriers collect goods from sellers, deliver to
buyers, and **collect the COD cash on Teka's behalf** → the **platform holds the cash and owes the seller
net (gross − commission)**. The existing Earning/wallet direction is therefore correct; proceed with
"platform-collects". Completion is **manual mark-paid + external reference** (no automated provider — COD
only). The admin approve→complete step IS the finance control point (operator only marks paid once cash is
actually sent). **CODE-COMPLETE on `develop` (A–E, #343–#350), PENDING RELEASE.** **Out of scope:** automated
payment-provider disbursement, multi-currency payouts, per-order COD cash-reconciliation ledger (the
platform-collects model + admin control point covers launch; a per-order rider-remittance ledger is a
later phase if needed).
- **A1** (#343) lifecycle completion: admin `POST .../process` (APPROVED→PROCESSING) + `.../complete`
  (APPROVED|PROCESSING→COMPLETED; `processedAt`+`externalReference`); guards; 9 unit tests. No migration
  (Payout row is the ledger — `Transaction.orderId` required, so no `Transaction{PAYOUT}`).
- **A2** (#344) seller payout notifications (approved/paid/rejected) — push primary + **email fallback**
  (money events; sellers always have email); 3 FR templates + `SellerNotificationService` methods.
- **B1** (#345) reusable destination: `SellerProfile.payoutMethod`/`payoutPhone` (**migration
  `2026-06-08_seller_payout_destination.sql`** — applied to DEV; **PROD via Action at release**);
  GET/PATCH `/v1/sellers/payout-method`; requestPayout defaults from saved destination.
- **C1** (#346) seller-web + **C2** (#347) seller-mobile: re-enabled request flow (saved destination,
  min-balance + single-pending guards, lifecycle display incl. reference/reason).
- **D1** (#348) admin-web mark-paid UI (process/complete + reference; also fixed pre-existing
  method/phone/seller-name field mismatches) + **D2** (#349) payouts CSV export (`/v1/admin/reports/payouts[/csv]`
  + "Virements" reports tab).
- **E** (#350) authz e2e (9 — all money endpoints 401 without auth) + docs (`docs/payouts.md` authoritative
  reference + ops runbook; api-reference/architecture/CLAUDE refreshed).

**RELEASED (release #351, 2026-06-08):** A–E shipped develop→main, deployed, prod migration
`2026-06-08_seller_payout_destination.sql` applied via the Action (success). **Verified on prod:** api +
all 3 storefronts healthy (200); new routes (`payout-method` GET/PATCH, admin `process`/`complete`, reports
`payouts/csv`) live + auth-guarded (401 without auth, bogus route 404). `develop == main`. **Operational
follow-up (not code):** finance team to use admin-web → Virements to process the first real payout.

---

**Initiative #2 — Discovery & Conversion** (started 2026-06-07, **PAUSED 2026-06-08 after Phase C**).
**Phase A — best-seller ranking + social proof: COMPLETE (#322–#324 — releasing now).** Decisions: popularity = denormalized **all-time
`Product.unitsSold`** (incremented on delivery; backfilled). A1 (#322) backend: `Product.unitsSold` +
index + migration `2026-06-07_product_units_sold.sql`; `deliverOrder` increments; `popularity` sort →
`[{isDemo:'asc'},{unitsSold:'desc'},{createdAt:'desc'}]`; `unitsSold` in browse list + detail. A2 (#323)
buyer-web "X vendus" on card + PDP. A3 (#324) buyer-mobile mirror. units-sold migration applied to dev;
**prod via the Action at release.** **Phase A shipped to prod (release #325) + verified; units-sold migration applied to prod + dev.**
**Phase B — search relevance + autocomplete: COMPLETE (#326–#329 — releasing now).** Decision: Postgres
FTS + pg_trgm (raw SQL). **P-B1** (#326): migration `2026-06-07_product_search_fts.sql` (generated
`tsvector` over title+description, French, GIN; `pg_trgm` + trigram index) applied to dev + SQL verified;
browse search ranks via raw SQL (real-above-demo → `ts_rank` → trigram similarity → recency), hydrates by
ranked id; cursor = offset. **P-B2a** (#327) `GET /v1/browse/search/suggestions` (top products +
categories). **P-B2b** (#328) buyer-web header autocomplete dropdown (debounced, keyboard-nav,
deep-links). **P-B2c** (#329) buyer-mobile category-suggestion chips above the live FTS grid. **Follow-up
(#331→#332):** prod verification found accent-sensitivity + weak typos; fixed with `unaccent` + IMMUTABLE
`f_unaccent()` (rebuilt `search_vector` over unaccented text) + `word_similarity` (`<%`). **Phase B +
follow-up SHIPPED to prod (releases #330, #332) + VERIFIED** (`rentree`→"rentrée"; `telephone`→"Téléphones"
categories; `Tecnoo`→Tecno; exact ok). Both search migrations applied to prod + dev. **Phase C — P-C1
(related products): SHIPPED to prod (release #336, 2026-06-08) + VERIFIED** (#333–#335). `GET
/v1/browse/products/:id/related` (same category, price ±40%, exclude current, real-above-demo →
best-seller/recency, top-up with same-category when sparse); "Produits similaires" carousel on buyer-web
(P-C1b #334) + buyer-mobile (P-C1c #335) PDPs. No migration (pure query/UI). **Prod verify:** source
`…188` (Kit fournitures, school-supplies cat) → 3 same-category items, source correctly excluded, prices
within/near the ±40% band (top-up fill engaged as designed). **Phase C — P-C2 (attribute filters):
SHIPPED to prod (release #340, 2026-06-08) + VERIFIED (#337–#339).** Decisions: SELECT/MULTISELECT only; plain options
(no counts); AND-across / OR-within. **P-C2a** (#337, API): `attributes` browse param (URL-encoded JSON
attrId→values); resolved to a product-id set via one raw pass (array overlap `string_to_array(value,',')
&& ARRAY[…]` so MULTISELECT comma-joined storage matches token-exact, `"8Go"`⊄`"128Go"`; `GROUP BY …
HAVING COUNT(DISTINCT attributeId)=N` enforces AND), injected into both Prisma + FTS branches; empty set
short-circuits; param parsed+bounded (≤10 attrs/≤30 vals, malformed→ignored). No migration. Live-DB SQL
verified. **P-C2b** (#338, buyer-web): checkbox facet groups per SELECT/MULTISELECT attr in category
ProductFilters (sidebar+sheet); `attrLabel` extracts French label from legacy `{fr,en}` JSON-string names.
**P-C2c** (#339, buyer-mobile): multi-select FilterChip groups in the category filter sheet; facets ride
`attributesJson` (String) on BrowseProductsParams (value-equatable family key); `_frAttributeLabel` mirror.
**D** conversion polish deferred. Out of scope: external search engine, ML recs, persisted view-tracking.
**Prod verify:** endpoint live (200 + envelope); facet filter resolves
correctly (returns 0 when no product carries the spec); malformed param ignored gracefully (200, full 188
results, no 500); positive-match proven on dev (Apple→1). **DATA CAVEAT:** prod sample/demo products were
seeded WITHOUT `ProductSpecification` rows (`specifications: []` on every sample product), so facets match
nothing on the *current* demo catalog. Real merchant products (specs set via the seller form) WILL be
filterable; demo catalog is slated for retirement (Initiative #1 P3c). Optional: a prod re-seed would
populate sample specs for demo-data facets. **Seller-label fix:** #341 (apply `attrLabel` to the seller
product form so attribute labels render "Marque" not raw `{"fr":…}`) — **MERGED to `develop`, PENDING
RELEASE** (one-file UI fix; rides the next develop→main, or a small dedicated release). **D** conversion
polish deferred. **Initiative #2 PAUSED after P-C2 (user decision 2026-06-08)** — A/B/C all shipped +
verified on prod; D is the only remaining phase and is deferred.

**Initiative #1 — Real Catalog & Merchant Supply: CLOSED OUT 2026-06-07** (code complete + shipped +
verified on prod). Phase 1 self-onboarding (#304–#308) + Phase 1 QA (#309–#313) + Phase 2 KYC
(#314–#318) + Phase 3 coexistence (#319–#321). 4 idempotent migrations applied to prod + dev
(`seed_delivery_zones`, `seller_commune`, `seller_kyc_document`, `product_is_demo`). A real merchant can
register → apply (with private KYC doc) → admin review (email+push decision, signed-URL doc view) → list
products that rank above the demo catalog; admins have approval + `catalog-coverage` tooling. **Deferred:
P3c demo retirement (hide + 301-to-category)** — only operable/testable once real merchants populate
categories; P3a ranking holds the line meanwhile. **Remaining work is operational (recruit real
merchants), not code.** Decisions: apply guard BUYER+SELLER; cityId derived from commune; KYC
private+signed+manual; isDemo on Product, real-above-demo primary sort. Out of scope (decided): external
RCCM/sanctions, vision moderation, variant SKUs, 3rd-party inventory sync. Full narrative in `PROGRESS.md`.

**Phase 3 — Sample-catalog coexistence (2026-06-07, #319–#320 — releasing now).** Decisions: build
P3a+P3b now, defer P3c; retirement (later) = hide + 301-to-category. **P3a** (#319): `Product.isDemo`
(default false; seed marks the Teka Officiel demo catalog; idempotent migration
`2026-06-07_product_is_demo.sql` adds the column + backfills the demo seller's rows). browse/search/home
rank real products above demo (`orderBy [{isDemo:'asc'}, <sort>]`). **P3b** (#320):
`GET /v1/admin/stats/catalog-coverage` (per-main-category real-vs-demo ACTIVE counts, rolled up from
subcats) + `/dashboard/catalog-coverage` admin page + sidebar item. **P3c (hide + 301 retirement)
DEFERRED** until real merchants populate categories (only operable/testable then). isDemo migration
applied to dev; **prod via the Action at release.** **Next: Initiative #1 closeout / await direction.**

**Phase 2 — Seller KYC (2026-06-07, #314–#317 — SHIPPED to prod, release #318 + verified; migrations
applied to prod + dev).** ID/RCCM photo + manual admin review.
Decisions: private storage + signed admin URLs; single required photo; manual review only. **P2a** (#314):
`SellerProfile.idDocumentCloudinaryId`/`idDocumentUploadedAt` (nullable; prod migration
`2026-06-07_seller_kyc_document.sql`); `CloudinaryService.uploadPrivateImage` (authenticated) +
`getSignedImageUrl`; `POST /v1/sellers/documents` (private upload); `ApplySellerDto.idDocumentCloudinaryId`
required + folder-constrained; `apply()` persists it; `GET /v1/admin/sellers/applications/:id/document`
→ admin signed URL. **P2b** (#315) seller-web upload control; **P2c** (#316) seller-mobile mirror; **P2d**
(#317) admin-web "Voir la pièce" signed-URL preview modal. **Migrations applied to BOTH prod and dev**
(`2026-06-07_seller_commune.sql` + `2026-06-07_seller_kyc_document.sql`); dev/prod schemas in sync.
**Next: Phase 3 — sample-catalog coexistence/retirement (review-gated).**

**Phase 1 QA pass (2026-06-07, #309–#312 — SHIPPED to prod, release #313 + verified; migration applied).** Four issues from the post-Phase-1 review,
fixed as separate PRs: **QA-4** (#309) admin Vendeurs list rendered `User.phone` (null for email
sellers) — now selects+renders `SellerProfile.phone` + searches boutique/phone; **QA-2** (#310) the
verification email 404'd — added seller-web `/verify-email` page calling `GET /v1/auth/email/verify`;
**QA-3** (#311) no admin signal for pending applications — `pendingSellerApplicationsCount` stat →
dashboard alert card + Vendeurs sidebar badge; **QA-1** (#312) added required **Commune** to the
application (nullable `SellerProfile.communeId`, required in DTO/forms; `apply()` derives `cityId` from
the commune; dynamic Commune dropdown filtered by Ville on seller-web + seller-mobile; admin detail shows
commune). **Prod migration `2026-06-07_seller_commune.sql` to apply via the Action after deploy.** Dev
`db:push` pending (cloud dev DB was unreachable).

**Phase 1 — Seller self-onboarding: COMPLETE + SHIPPED** (P1a #304, P1b #305, P1c #306, P1d #307;
released #308 + verified on prod). The `register/email`→SELLER vs `/sellers/apply`→BUYER dead-end is reconciled. A real
merchant can now register (web `/inscription` + mobile), submit the business application
(`/devenir-vendeur` on seller-web + seller-mobile, calling `/sellers/apply`), see PENDING/REJECTED states,
and is notified by **email + push** on the admin's approve/reject decision; approved sellers reach the
dashboard and can list products. Phone via `normalizeDrcPhone` SSOT (ported to seller-mobile). Next:
**Phase 2 — KYC ID/RCCM photo upload + admin review surface** (present plan before coding).

## Recently completed — 2026-06-07

**Delivery-fee preview quick win** (#300 → release #301; `chore` #302 → release #303) — **SHIPPED +
VERIFIED on prod.** New `POST /v1/checkout/quote` backed by a shared `CheckoutService.resolveDeliveryFee`
extracted from `checkout()` → previewed fee == charged fee by construction. Fixed buyer-web `/paiement`
(was 400 → 0) + buyer-mobile (was `--`, total omitted the fee). 4 API unit specs + 3 mobile model/parity
specs. **Zone data op done:** root cause was that `seedDeliveryZones` only ran in the dev-only Phase 4
block (after the `isProd` return), so prod's `delivery_zones` table was always empty → every order hit
the 5,000 CDF default. Fix shipped both layers: (a) extracted `seedDeliveryZones()` to run in prod too
(idempotent, updates fees on conflict); (b) idempotent migration `2026-06-07_seed_delivery_zones.sql`
applied to prod via the Action (`INSERT 0 12`). **Verified live** — all 4 launch routes now return seeded
fees with `isDefault:false`: Lub→Lub 3,000 · Kol→Kol 3,000 · Lub→Kol 15,000 · Kol→Lub 15,000. Checkout
quote + order pricing consume the same `estimateFee` path → both now use seeded values. NON-goals held
(no City/Commune redesign, no logistics ops, no pricing-model change). Full narrative in `PROGRESS.md`.

## Earlier completed — 2026-06-07

**Mobile Parity Sweep** (5-phase initiative, #293–#297 + docs #298) — **SHIPPED to prod (release #299;
main=develop=`5239207`).** Audited buyer-mobile + seller-mobile vs recent web/API changes; the apps were
already largely at parity, so only the genuine gaps were closed: P1 city-scoped category/search + new
API model fields, P2 wishlist count badge + inactive-product handling, P3 full client PostHog ecommerce
events (closed the documented deferral), P4 seller-account-on-buyer-OTP guard, P5 dead `/auth/migrate`
button removed + OTP server cooldown. **Mobile + docs only** — no web/API change, no migration (merging
built new images; mobile APK/Play-Store rollout is a separate distribution step). Decision D1: keep
mobile auth-required (web guest flows N/A on native). P6 close-out also slimmed **CLAUDE.md** 38.6k→29.5k
(feature spec + phase table → `docs/product-spec.md`). Verified: both apps 0 analyze errors + tests green
(buyer 71 / seller 3); teka.cd + api healthy. Full narrative in `PROGRESS.md`.

## Deferred / backlog (future maintenance)

- **API lint is unenforced, and running it rewrites the tree** *(recorded 2026-07-30; needs its own
  focused task — deliberately NOT touched during the new-only catalog initiative).* Three separate
  facts, all pre-existing:
  1. **`pnpm lint` mutates files.** `apps/api`'s script is `eslint "{src,apps,libs,test}/**/*.ts"
     **--fix**`, so merely *checking* lint rewrites source. This is where the recurring "28 modified
     `apps/api` files that nobody edited" comes from — a run during this initiative reproduced that
     working-tree diff **byte-for-byte identical** to a backup taken beforehand, which is what
     identified the cause. Anyone who runs `pnpm lint` will see it again.
  2. **CI does not lint.** The workflow job named **"Lint & Type Check"** (`.github/workflows/ci.yml`)
     runs `pnpm type-check` only — there is no `pnpm lint` step. The name implies a guarantee that is
     not enforced anywhere.
  3. **There is a real backlog behind it:** `pnpm lint` currently reports **943 errors / 218 warnings**
     in `apps/api` (mostly `@typescript-eslint/no-unsafe-*` around untyped Prisma/JSON boundaries).
     `buyer-web` is clean (0 errors, 5 warnings); the Flutter apps are analysed separately and pass.

  A fix has to sequence these: split a non-mutating `lint` from a `lint:fix`, land the formatting-only
  reflow as one reviewable commit, burn down or explicitly `.eslintrc`-waive the 943, and only then add
  the CI step — adding the step first would red-wall every PR.

- **seller-mobile dashboard stats breakdown** (product status counts + avg rating) and **PDP
  related-products section** — the two optional/cosmetic items from the Mobile Parity Sweep P5.
  Not parity-blocking; deferred by user 2026-06-07.
- **Prod `db:seed` to clean up legacy product slugs.** The city-first migration backfilled
  `Product.shortCode` + `City.slug` but left existing product `slug`s in the OLD city-embedded form
  (`…-lubumbashi-310000`). URLs **resolve correctly and are canonical** (by `shortCode`) — purely
  cosmetic: e.g. `/lubumbashi/kit-fournitures-…-lubumbashi-310000-8580a5` vs the clean
  `/lubumbashi/kit-fournitures-rentree-cahiers-stylos-8580a5`. A prod `db:seed` (idempotent) rewrites
  them via the new `generateProductSlug(title)`. **Deferred by user 2026-06-06; safe to run anytime.**
  New products created post-refactor already get clean slugs — this only affects the seeded sample
  catalog. No code change required.

## Recently completed — 2026-06-06

**SEO / City-First URL Refactor** (7-phase initiative + 1 follow-up fix, all SHIPPED to prod).
Authoritative reference `docs/url-and-seo-strategy.md`; tracker `tasks/seo-city-url-refactor-progress.md`;
full narrative in `PROGRESS.md`.
- **#283–#289 → release #290** (`main=3105ce0`): city-first URLs `/{ville}/{slug}-{shortCode}` +
  `/{ville}/categorie/{slug}`; clean city-free `slug` + unique `Product.shortCode` resolver + `City.slug`;
  French storefront routes (`/panier /paiement /commandes /favoris`) with 301/308s; de-blocked crawlable
  homepage; city-first sitemap/canonical/JSON-LD. Prod migration `2026-06-06_city_first_urls.sql` applied.
  Mobile + analytics untouched by design.
- **#291 → release #292** (`main=cd0326c`): fixed the stale-token `/connexion` bounce surfaced during
  release verification — middleware no longer bounces auth-only routes on cookie *presence*; `/connexion`
  redirects already-logged-in users from the **real** session state. Verified live: a stale-cookie guest
  now reaches the login form and the wishlist heart's guest flow works. 11 middleware + 4 connexion tests.
- **Deferred:** legacy-slug cleanup (`db:seed`) — see Backlog above.

## Recently completed — 2026-06-05

**Wishlist (Favorites) completion & hardening** (6-PR initiative). Master tracker:
`tasks/wishlist-completion-progress.md`. Merged to `develop`: **#272–#274** (API + buyer-web) + the
mobile/docs PRs.

**Net effect:** the feature already existed end-to-end but was incomplete; audited all 3 surfaces, then
completed it to ecommerce best-practice with the **API as single source of truth**, buyer-web ↔
buyer-mobile parity, no N+1, and no SEO/CWV regression.
- **API:** `GET /v1/wishlist/count`; add now rejects non-ACTIVE/deleted products; `/check` UUID-filtered;
  service unit spec (11) + 2 e2e auth contracts. Authz/IDOR + dedup verified.
- **buyer-web:** `wishlist-store` (ids Set + batch hydrate → no per-card N+1); heart on ALL listing
  surfaces + header count badge; `/wishlist` add-to-cart (keeps item) + stock + error/retry; **guest
  heart → login → auto-continue** (safe-redirect guarded).
- **buyer-mobile:** heart on product cards + hydration; seller name; add-to-cart on the wishlist card.
- **Analytics:** kept `wishlist_added`/`removed`; added `wishlist_viewed` + `wishlist_item_moved_to_cart`
  on web + mobile (no PII). **Decisions:** guest auto-continue; keep shipped names; add-to-cart keeps item.
- Docs: `docs/api-reference.md` + `docs/analytics.md` updated.

## Recently completed — 2026-06-04

**PostHog platform rollout** (8-PR initiative, PR-1→8). Master tracker: `tasks/posthog-rollout-progress.md`.
Authoritative reference (rewritten platform-wide): `docs/analytics.md`. Merged to `develop`: **#262–#268**
+ docs/closeout. **Not yet released to `main`.**

**Net effect:** PostHog extended from buyer-web-only to **all 6 surfaces** — api (`posthog-node`
`@Global AnalyticsModule`/`PostHogService`, server-owned auth/order/payment/admin events), seller-web +
admin-web (cloned the buyer-web provider), buyer-web custom UI event taxonomy, and both Flutter apps
(`posthog_flutter`, screen+lifecycle+identity, byte-for-byte lockstep). One US-Cloud project;
`distinctId = user.id` everywhere; identity carries **id+role only** (never phone/email); each event has
ONE authoritative owner (server=transactional, client=UI-intent — no duplication); `api_error` +
`notification_sent` excluded by decision. `POSTHOG_API_KEY` wired into the api container
(deploy.yml/compose); the 3 web `NEXT_PUBLIC_POSTHOG_KEY_*` GitHub Secrets + the API secret are
provisioned; mobile keys are per-flavor (prod injected at build). R2 fixed (dev keys empty). Green
throughout: api 22 unit + 90 e2e; web type-check + `pnpm build`; mobile `flutter analyze` + tests.

**Decisions captured:** single prod project + dev keys empty; system events = `payment_*` only;
API-first sequencing; `posthog_flutter` (official) approved. **Deferred:** custom buyer-mobile ecommerce
events; server-side flag bootstrap; replay↔Sentry linking; on-device mobile init verification (analyze +
unit-tested only — add `AUTO_INIT=false` manifest meta-data if a startup warning appears).

**Note for future work:** repo `pnpm lint` is pre-existing-red (510 errors in untouched files) — NOT a
CI gate; type-check + tests are. Never run the broad `pnpm lint` (`--fix` rewrites unrelated files);
scope eslint to edited files.

## Recently completed — 2026-05-27

**Mobile connectivity management** (7-PR initiative, PR1 → PR7). Plan archived at `~/.claude/plans/archive/mobile-connectivity-management.shipped.md`. Authoritative reference: `docs/mobile-connectivity.md`. New CLAUDE.md Rule 15 enshrines the hard rules.

**Net effect:** Both Flutter apps (`buyer-mobile` + `seller-mobile`, kept byte-for-byte identical) now ship a centralized 5-state connectivity machine (`connected | unstable | noInternet | disconnected | reconnecting`), a 4-layer Dio interceptor chain (`OfflineAware → Auth → Retry → Log`), a global 5-color banner above every route, app-lifecycle pause/resume hooks, SharedPreferences-backed cart persistence with offline-safe hydration, hard-block checkout on offline, connectivity-aware auth-refresh that no longer logs users out on transient timeouts, and rate-limited Sentry capture on real degradations. 54 buyer-mobile specs; same coverage in seller-mobile.

- **#243 → #244** (PR1) — Core foundation. `ConnectivityStatus` enum + `ConnectivitySnapshot`, `ConnectivityService` with injectable `interfaceStream` + `probe`, Riverpod providers. Probe hits `${ApiConstants.baseUrl}/v1/health` with 3s timeout; 30s healthy cadence; 5s `noInternet` cadence; 2-slow-probes-to-unstable / 1-fast-out hysteresis. `connectivity_plus ^6.0.0` added.
- **#245 → #246** (PR2) — Dio integration. `RetryInterceptor` (full-jitter `[0..500ms, 0..1500ms, 0..4000ms]` capped 5s, GET/HEAD only or `extra: {retryable: true}` opt-in), `OfflineAwareInterceptor` (synthesizes `connectionError` on non-safe verbs when disconnected; `extra: {allowOffline: true}` opt-out for cache-driven reads). `AuthInterceptor` distinguishes connectivity-caused refresh failure (`connectionTimeout` / `receiveTimeout` / `sendTimeout` / `connectionError` / `502/503/504`) from real 401s — tokens preserved on the former. 19 unit tests.
- **#247 → #248** (PR3) — Global UI banner. `ConnectivityBannerHost` mounted via `MaterialApp.router.builder`. Red / orange / green by state. `_previousOfflineStatus` only tracks `disconnected` + `noInternet` so startup `reconnecting → connected` doesn't flash green. `AnimatedSize` + `AnimatedSwitcher` 200ms. 5 new `app_fr.arb` keys + regen of `app_localizations*.dart`. 8 widget tests with `_settleEmission` helper.
- **#249 → #250** (PR4) — Lifecycle integration. `ConnectivityLifecycleObserver(ConsumerStatefulWidget + WidgetsBindingObserver)` wraps the banner host. `paused/inactive/hidden → service.pause()`, `resumed → service.resume()`. Deliberately does **not** invalidate authProvider on resume — PR2's auth interceptor already handles it. 8 widget tests.
- **#251 → #252** (PR5) — Offline behavior. `TypedCache` (SharedPreferences-backed envelope `{v:1, savedAt, ttlMs, value}`, stale-while-reconnecting). `main.dart` preloads `SharedPreferences` and overrides `sharedPreferencesProvider` (was throwing `UnimplementedError`). `CartNotifier` hydrates from cache synchronously → `fetchCart` updates silently. 30-day TTL. Checkout review step watches `isOfflineProvider`: button disabled + permanent banner "Connexion requise pour passer commande" with `Icons.wifi_off_outlined`. 9 unit tests.
- **#253 → #254** (PR6) — Sentry monitoring. `ConnectivitySentryReporter`: `connectivity_state` tag on every event via `Sentry.configureScope`, breadcrumb (category `connectivity`) on every transition, rate-limited (1/min) capture on `connected → noInternet` + ≥5 consecutive `noInternet` snapshots. `RetryInterceptor` adds `_maybeCaptureBudgetExhaustion` for retry-budget exhaustion (also 1/min). Uses recommended `setContexts` API instead of deprecated `setExtra`. No-op when `SENTRY_DSN` is empty.
- **PR7** (this commit) — Docs + cleanup. New `docs/mobile-connectivity.md` (authoritative reference: state machine ASCII diagram, retry / offline / observability tables, "adding a new feature" checklist, deferred work). CLAUDE.md Rule 15 "Mobile connectivity discipline" (hard rules: never bypass the chain, never `retryable: true` on non-idempotent calls, never log creds/tokens/phones, mirror buyer-mobile ↔ seller-mobile in same PR). `docs/architecture.md` gains a "Mobile network-resilience layer" subsection. Deduped 6 copies of `_extractErrorMessage(DioException)` in buyer-mobile feature providers into one shared `apps/buyer-mobile/lib/core/network/dio_error_messages.dart`. STATUS closeout + plan-file archival.

**Locked decisions captured for future maintainers:**
- Reachability probe is `${ApiConstants.baseUrl}/v1/health` — no `internet_connection_checker_plus` dependency. The probe target is what the API considers "alive," not a generic public IP.
- Cart persists to SharedPreferences. Cart **mutations** when offline are blocked (no queue-and-replay) — replay would race against price + stock changes during the offline window.
- Order placement when offline is hard-blocked at the checkout review step (button + permanent banner). No queue-and-replay anywhere.
- The two Flutter trees are kept byte-for-byte identical for the connectivity layer; changes must ship in lockstep.
- Cache wiring is opt-in. Today only the cart is wired; `productsList` / `categoriesTree` / `userProfile` / `sellerOrdersList` keys are reserved in `cache_keys.dart` but unused — future opt-in pass.

## Recently completed — 2026-05-25 → 2026-05-26

**Orange + Africa's Talking SMS + Flexpay Mobile Money removal** (10-PR initiative, A1 → D3). Plan archived at `~/.claude/plans/archive/orange-flexpay-removal.shipped.md`. The 2026-05-24 outage gap (operator stripped `ORANGE_*` / `FLEXPAY_*` envs from `.env.production` before the API was tolerant of them missing → Joi crash-loop for ~2h) is now permanently closed.

**Net effect:** ~1450 lines deleted across 50+ files, ~250 added. 10 feature PRs + 7 release PRs + 1 docs/closeout PR shipped to main. The api boots silent (no `SMS_PROVIDER=mock` warning), broadcasts compose with 500 chars instead of 160, admin UI shows Push + Email only, checkout is COD-only, `apps/api/src/sms/` directory is gone, 14 env keys dropped from Joi validation + stripped from `.env.production` on the VPS.

**Phase A — notification rerouting (additive):**
- **#221 → #222** (A1) — `EmailService.sendOrderNotification` + 5 buyer order-event email templates (confirmed / shipped / delivered / cancelled / payment-confirmed). French, brand red, inline styles. Dormant until A2.
- **#223 → #224** (A2) — `OrderNotificationService` swapped its dead `sendSms()` stub for `pushOrEmail()`: push via FCM primary; falls back to email when `PushService.sendToUser` returns `succeeded=0`. Sellers stay push-only.
- **#225 → #226** (A3) — `BroadcastsService` dual-publish: new `NotificationBroadcast.channels Json?` column (manual SQL migration `2026-05-25_broadcast_channels.sql` applied via `Apply prod migration` workflow), per-broadcast `{push, email, sms}` toggle with default `{push:true, email:true, sms:false}`. `EmailService.sendBroadcast` + `broadcast.template.ts` shipped. `NotificationPrefs` extended with `pushBroadcasts` + `emailBroadcasts` opt-outs.

**Phase B — Flexpay + MM UI deletion:**
- **#227** (B1) — Dead Mobile Money UI removal across buyer-web + buyer-mobile + `@teka/shared`. Removed `ENABLE_MOBILE_MONEY` toggle, MM tile + provider picker + payer-phone input, `MobileMoneyProvider` shared type + constants. `PaymentMethod` union kept for legacy-order display.
- **#228 → #229** (B2) — API Flexpay deletion. Removed `apps/api/src/payments/providers/`, `apps/api/src/payments/interfaces/`, `initiate-payment.dto.ts`. Simplified `PaymentsModule` / `PaymentsController` / `PaymentsService` to COD-only — no `PAYMENT_PROVIDER` factory, no `POST /v1/payments/initiate`, no `POST /v1/payments/webhook/flexpay` (both 404 now), no `handlePaymentCallback`. `CheckoutDto.paymentMethod` narrowed to `'COD'` only (legacy MM POSTs get a clean French 400). Pre-flight verified: prod had 0 pending FLEXPAY transactions.
- **#230** (B3) — Admin broadcasts channel picker (Push + Email + dimmed SMS-déprécié). POST body now sends `channels: { push, email, sms }`. Form save disabled until at least one channel selected.

**Phase C — env validation + SMS module deletion (the load-bearing change):**
- **#231 → #232** (C1) — Dropped 14 env keys from Joi schema (`SMS_PROVIDER`, `ORANGE_*` × 4, `AT_*` × 3, `FLEXPAY_*` × 5, `PAYMENT_MOCK_MODE`). Flipped `sms.module.ts` JS-level `SMS_PROVIDER` fallback `'orange' → 'mock'` so the post-strip default is safe no-op + loud `warnIfMockInProd` startup ERROR. **Operator then stripped the 14 keys from `.env.production` on the VPS** — boot confirmed clean (`[SmsProviderFactory] ERROR ⚠️  SMS_PROVIDER=mock` log line emitted as expected).
- **#233 → #234** (C2) — Deleted `apps/api/src/sms/` directory entirely (`SmsService`, `SmsModule`, Orange DRC + AT + mock providers, `sms-provider.interface.ts`). Dropped SMS branch from `BroadcastsService.processBroadcastSending` + `BroadcastChannels.sms` field + `BROADCAST_DEFAULT_CHANNELS.sms`. Dropped `smsBroadcasts` from `NotificationPrefs` DTO + resolver + `shouldSendBroadcasts` predicate (no callers after C2). Bumped broadcast `message.MaxLength` 160 → 500. Cleaned admin-web (SMS checkbox + `smsBroadcasts` profile toggle gone, 4 i18n keys dropped). **Kept `smsOrderUpdates` + `shouldSendOrderUpdates`** — name is legacy but the field still gates push + email-fallback order events (renaming would need a JSON data migration; out of scope).

**Phase D — cleanup:**
- **#235** (D1) — Seed updates: sample orders 2 + 5 paymentMethod `MOBILE_MONEY → COD`; order 5 paymentStatus `REFUNDED → FAILED` (COD-cancelled means no money was ever taken). 3 sample transactions provider `FLEXPAY → COD`. Fixed a pre-existing seed inconsistency where order 3's transaction was FLEXPAY while the order itself was already COD.
- **#236** (D2) — Docs sweep: `CLAUDE.md` (Rule 11 + 14 rewritten, § 2 Tech Stack, § 3 env vars, post-phase chronology entry), `docs/architecture.md` (3-stack messaging diagram, Payment Webhook section removed, COD-only design decision), `docs/api-reference.md` (removed endpoints callout, payouts manual-ops note), `docs/deployment.md` (env-vars table + go-live checklist purged of SMS + Flexpay).
- **D3** (this commit) — STATUS closeout + plan-file archival.

**Decisions captured for future maintainers:**
- `PaymentMethod.MOBILE_MONEY` + `TransactionProvider.FLEXPAY` Prisma enum values **stay forever** — required for read-side rendering of legacy orders/transactions.
- `smsOrderUpdates` field name kept despite the SMS branch being gone (storage-format back-compat; documented inline in `notification-prefs.dto.ts`).
- Re-introducing automated payments would mean adding a new provider abstraction from scratch — none currently exists in the codebase.
- Re-introducing SMS would need a written architecture decision per Rule 11 (the removal closed a load-bearing outage gap).

## In-flight PRs

None.

## In-flight local branches

None.

## Recently completed — 2026-05-24

**Sentry deprecation cleanups** (#215 + #216, released via #217).
- **#215** — `SENTRY_AUTH_TOKEN` now ships via BuildKit secret mount (`RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN`) on the 3 web Dockerfiles, with a matching `secrets:` block on `docker/build-push-action` in `deploy.yml`. Silences the `SecretsUsedInArgOrEnv` Docker BuildKit lint that fired on every deploy. Token never lands in any image layer (was already build-stage only; now also out of metadata).
- **#216** — `sentry.client.config.ts` → `instrumentation-client.ts` × 3 webs (via `git mv`, preserves history). Silences the `@sentry/nextjs` 10.x deprecation warning + makes the apps Turbopack-ready.
- Post-merge deploy ran clean; both targeted warnings gone from the build log. The `disableLogger` deprecation is still present (intentionally deferred — needs verification of the exact `webpack.treeshake.removeDebugLogging` config shape for Next.js 15).

**Auto-sync `docker-compose.prod.yml` on deploy** (#212 → #213). Root-cause fix for today's outage: the deploy workflow now scp's the compose file to the VPS before each rolling deploy. Single new step in `deploy.yml` using `appleboy/scp-action@v1`. First post-merge deploy ran clean.

**API outage post-mortem** (~17:30 → 19:30 UTC, ~2h):
1. PR #208 added `env_file: .env.production` to the 3 web services in `docker-compose.prod.yml`. The new image rolled to prod, but **the compose file on the VPS was never synced** (no mechanism — caught by PR #212/#213 above).
2. Operator uploaded a fresh `.env.production` with the Sentry vars added + the `ORANGE_*` / `AT_*` / `SMS_PROVIDER` keys stripped (anticipating a future Orange removal initiative).
3. Operator ran `up -d --no-deps`. Webs didn't pick up the new env (their compose was still pre-PR-208). API was recreated against the stripped `.env.production` and crash-looped on `@nestjs/config` validation (`"ORANGE_CLIENT_ID" is required`) until we noticed.
4. Recovery: restored the missing env vars from `.env.production.bak.*` (the operator had backed up before the upload — saved us); `up -d --no-deps api`; `nginx -s reload` to refresh nginx's cached upstream IPs after the web containers were recreated; verified all 5 services healthy.
5. Sentry capture verified end-to-end via `/v1/health/sentry-test` → event landed in `teka-api` project tagged correctly.

**Sentry rollout — all 6 surfaces** (5-PR initiative). API was already wired (DSN was just empty in prod); the gap was the 5 frontends + DSN values + source-map / debug-symbol upload. All 6 surfaces now capture errors, tag with `environment: production`, and (for webs + mobile) attach source maps / native debug symbols.

PRs in order:
- **#202 → #203** (PR 1) — API: phone-number `beforeSend` scrubber + explicit `SENTRY_ENVIRONMENT` (was using `NODE_ENV` which is "production" in both staging + prod, so couldn't distinguish them).
- **#204 → #205** (PR 2) — `@sentry/nextjs@^10.53.1` wired into buyer-web + seller-web + admin-web. `sentry.{client,server,edge}.config.ts` + `instrumentation.ts` + `sentry-scrub.ts` per app. Per-app env vars (`NEXT_PUBLIC_SENTRY_DSN_<APP>` for client, `SENTRY_DSN_<APP>` for server) so the three apps don't collide on the shared root `.env`.
- **#206 → #207** (PR 3) — `sentry_flutter@^9.20.0` wired into buyer-mobile + seller-mobile via the existing `FlavorConfig.instance.sentryDsn` plumbing. Bumped from 8.x → 9.x because 8.x's Kotlin language version 1.6 is rejected by the project's Kotlin 2.2.20 compiler.
- **#208 → #209** (PR 4) — CI release tagging + source-map / debug-symbol upload across all 6 surfaces. 3× Next.js Dockerfile build-args, `deploy.yml` build-arg expansion + `SENTRY_RELEASE`/`SENTRY_ENVIRONMENT` export, docker-compose env wiring, `build-mobile-apk.yml` `--dart-define` injection + `sentry_dart_plugin` symbol-upload step. Smoke-tested on the PR branch — 8 native symbols uploaded + Sentry release created per APK build.
- **#210 → #211** (PR 5) — `docs/sentry.md` rewritten to cover all 6 surfaces, build flow, required secrets, troubleshooting table, known follow-ups.

**Mobile Android flavors** — both Flutter apps now ship as three Android product flavors (`development` / `staging` / `production`) so dev / staging / prod builds can install side-by-side with their own bundle IDs and display names. Production keeps its existing applicationId so the Play Store listing is unaffected; dev/staging get `applicationIdSuffix` (`.dev` / `.staging`). iOS flavors are intentionally out of scope — wait on the long-deferred PR C (iOS scaffold) below. Documented in `docs/mobile-flavors.md`.

PRs in order:
- **#195 → #196** (PR 1) — Android flavor scaffold for both apps. `flavorDimensions` + `productFlavors` in `build.gradle.kts`, `AndroidManifest.xml` switched to `@string/app_name`, new `lib/core/config/flavor.dart` + `flavors/{dev,staging,prod}.json` consumed via `--dart-define-from-file`. `ApiConstants.baseUrl` delegates to `FlavorConfig.instance.apiBaseUrl`. Production-flavor APK verified on emulator (home screen renders picsum images from `api.teka.cd`).
- **#197 → #198** (PR 2) — Flavor-aware `Build mobile APK` workflow. Two-axis matrix (`app × flavor`), `--flavor` + `--dart-define-from-file` in the build step, artifact names include flavor. Smoke run (`app=buyer, flavor=production, variant=release`) green → `app-production-release.apk` (58.9 MB) artifact.
- **#199 → #200** (PR 3) — `docs/mobile-flavors.md`: architecture, build commands (local + CI), Firebase Console steps to enable dev/staging, secret management, "adding a new environment" runbook, common-error reference.

**Dev seed Teka Officiel email collision** (#193 → #194). `seedTekaOfficielSeller()` was upserting by `User.id` but creating with `email = 'ipanga@outlook.fr'` (the operator's real email, set 2026-05-18). Any dev DB with the operator's user at a different id blew up at the seller create with P2002 on email. Rewrote as three-path resolution: id match → update; else email match → adopt that user as the platform seller; else create fresh with canonical id. Sample products chain to whichever id we resolved. Prod path unchanged — production's Teka Officiel matches by canonical id (path 1).

## Recently completed — 2026-05-23

**Buyer-mobile OTP error humanization** (#190 → #191). Verify screen was rendering raw `DioException.toString()` on 401, dumping an 8-line trace + MDN HTTP-docs link + "fix your request code" advice onto the user. Replaced with inline helper that surfaces the API's French `error.message` (e.g. "Code OTP invalide ou expiré"), with status-keyed fallbacks for 400/401/429 and a generic catch-all. Verified on emulator with wrong code → clean one-liner. Helper duplicated four ways now (catalog/checkout/cart + new OTP); a shared-util promotion is a logical next refactor.

**`Run prod seed` workflow** shipped end-to-end. Re-fired prod seed, prod product_images now point at per-product picsum.photos URLs (confirmed via `GET https://api.teka.cd/api/v1/browse/products?limit=1` returning `image.url=https://picsum.photos/seed/<productId>-0/600/600`). Buyer-mobile home screen also visually verified rendering the new picsum images.

PRs in order:
- **#183 → #184** — `Run prod seed` workflow_dispatch action (concurrency-locked, `confirm: RUN` guardrail).
- **#185 → #186** — 3-tier tsx resolver in the workflow (pnpm symlink, raw cli.mjs, or ephemeral global install) after first fire hit `tsx not found` on the prod image.
- **#187 → #188** — seed.ts: prod mode reuses the oldest existing ADMIN row via lookup instead of trying to upsert one (per `docs/deployment.md § 5b`, prod admins are seeded out-of-band; the old `requireInProd` would have either no-op'd or created a duplicate admin on every re-seed). Opt-in via `SEED_INCLUDE_ADMIN=true`.
- **#190 → #191** — buyer-mobile OTP verify error humanization (see above).

## Open follow-ups from the flavors initiative

- **One-time Firebase Console step (per app).** Add `com.tootiye.teka.dev` + `com.tootiye.teka.staging` as Android apps in the buyer Firebase project. Repeat for `com.tootiye.tekaseller.{dev,staging}` in the seller project. Re-download the merged `google-services.json` and replace the local file + the `{BUYER,SELLER}_GOOGLE_SERVICES_JSON_B64` GitHub secrets. Until this is done, dev + staging flavor builds fail at `:processGoogleServices*` with a clean actionable error. Procedure in `docs/mobile-flavors.md § Firebase setup`.
- **Staging backend infra.** Staging is hypothetical for now; `flavors/staging.json` carries the placeholder `https://staging.api.teka.cd/api`. When real infra lands, flip the URL + (optionally) provision a dedicated Firebase project + Sentry DSN.
- **Per-flavor Firebase secrets (later).** Today one `google-services.json` per app covers all 3 packages. When separate Firebase projects per env exist, split into `_DEV` / `_STAGING` / `_PROD` GitHub secrets and select per `matrix.flavor` in the workflow. Flagged inline in `.github/workflows/build-mobile-apk.yml`.
- **iOS flavors.** Blocked on the long-deferred PR C (iOS scaffold for both apps). When PR C lands, mirror the Android flavor shape: Xcode schemes per flavor, per-flavor `GoogleService-Info.plist`, bundle IDs matching Android.
- ~~**Real signing keystore.**~~ **RESOLVED.** Both apps have real upload keystores (generated 2026-07-01) and the release `signingConfig` loads `android/key.properties`, falling back to debug only when it is absent. The 8 CI signing secrets were set 2026-08-29 and `Release mobile AAB` verifies the bundle is not debug-signed before uploading the artifact.

## Open follow-ups from today's outage

- **Orange + Africa's Talking SMS + Flexpay removal** — the actual root-cause fix for today's outage. Operator stripped these env vars because the underlying services are no longer in use; the API config schema still requires them. Decisions locked in (2026-05-24):
  - Notifications: route via Gupshup WhatsApp templates (today only buyer OTP goes through Gupshup; would need new templates for `order_status`, `payment_received`, broadcasts — each ~24-48h Gupshup approval).
  - Payments: Cash-on-Delivery only — remove Flexpay entirely. Drops MM/Mobile Money UI on buyer-web + buyer-mobile, the entire Flexpay provider + webhook handler, sample MM transactions in seed data.
  - Scope: `apps/api/src/sms/` (4 providers + module), `apps/api/src/payments/` (Flexpay provider + factory + webhooks), `apps/api/src/config/configuration.ts` (drop required keys), `OrderNotificationService` (swap `SmsService` → `WhatsappService`), Gupshup template submissions, mobile + web payment-picker UI, CLAUDE.md (Rule 11 + 14 + Tech Stack), `docs/architecture.md`.
  - Pre-step: submit the new Gupshup templates so they're approved by the time the code lands.

## Open follow-ups from the Sentry rollout

- **`disableLogger: true` deprecation** in 3 `next.config.ts` files — Sentry now recommends `webpack.treeshake.removeDebugLogging` instead. Warning at every build. Deferred pending verification of the exact migration path for Next.js 15 + `@sentry/nextjs` 10.x (the deprecation message names the option but not the config-tree location).
- **Sentry GitHub integration + `org:read` on the auth token** would let us re-enable `commits=true` in `sentry-dart-plugin` config and get per-commit issue resolution in the Sentry UI. Today the workflow sets `commits=false` to avoid the 403 from the missing integration. Operator action in Sentry web UI required first.

## Open follow-ups from earlier today

- **Promote `extractApiError(DioException)` to a shared util**. Four copies now (catalog/checkout/cart + OTP).

**Earlier same day:**
- **#181 → #182** — seed change: per-product Picsum URLs + mutable image upsert (so re-seed actually propagates).
- **#179 → #180** — buyer home product card 7px overflow fix.
- **#177 → #178** — buyer home product list sortBy + envelope-parse bugs.

## Buyer push notifications — fully validated 2026-05-22

End-to-end round-trip confirmed on the emulator: login → `POST /v1/users/device-tokens` → backend row → `firebase-admin.messaging().send` from inside the api container → FCM delivery → notification on device. Buyer FCM stack is production-functional for Android (iOS pending).

Shipped 2026-05-21 / 22:
- **#150** (PR A) — backend `DeviceToken` + endpoints + `PushService` + `OrderNotificationService` push fan-out for all 5 buyer order events.
- **#160** (PR A.5) — `PushService` accepts discrete `FIREBASE_PROJECT_ID` + `FIREBASE_PRIVATE_KEY` + `FIREBASE_CLIENT_EMAIL` env vars (GitHub-Secrets-friendly).
- **#154** — `apk add postgresql-client` in api Dockerfile so manual migrations work via `docker exec`.
- **#155 + #157** — `Apply prod migration` GitHub Action handling `@` in `DATABASE_URL` password.
- **#159** (PR B) — Flutter FCM client + Android config for buyer-mobile.
- **#162** — GoRouter rebuild-on-auth-change fix that was silently breaking OTP login.

Manual migration applied to dev + prod DBs (the `device_tokens` table).

## Pending in the push initiative

- **PR C** — iOS scaffold for both apps (`flutter create --platforms=ios .` per app, GoogleService-Info.plist placement, Push Notifications + Background Modes capabilities). APNs `.p8` already uploaded to Firebase Console (same key for buyer + seller — project-wide auth key).
- **PR D** — CI/CD secret injection. Base64-encode the credential files into GitHub Secrets; deploy workflow writes them to `/home/deploy/teka-rdc/secrets/` at deploy time. Today the gitignored credentials only exist on the operator's Mac.
- **PR C** — iOS scaffold for both apps (`flutter create --platforms=ios .` per app, GoogleService-Info.plist placement, Push Notifications + Background Modes capabilities). APNs `.p8` already uploaded.
- **Remaining PR E work** — stock-alert pushes (needs SKU-threshold schema first) + web push evaluation. Tap-navigation + product-approval/rejection + new-review events already shipped.

## Next candidates (unrelated to today's initiatives)

Surfaced by a 2026-05-21 code-rot audit. Not yet picked up.

| # | Candidate | Effort | Why |
|---|---|---|---|
| 1 | **Real popularity metric** for `GET /v1/browse/products?sort=popularity` (currently falls back to `createdAt desc`) | M | UX gap — buyers see only newest, no "best-selling" surface. |
| 2 | Mark `AuthProvider.GOOGLE` + retired `PHONE_OTP` paths as `@deprecated` in `packages/shared/src/types/auth.ts` | M | Dead enum members still type-allowed. |
| 3 | Move retired-endpoint e2e tests (`/v1/auth/otp/*`) to `deprecated-e2e.spec.ts` | M | Tests pass but the routes 404 in prod — false confidence. |
| 4 | Bulk Flutter `InputDecoration` border modernization across both mobile apps | S | Not broken, lagging current Material 3 idiom. |

## Recently archived plans

- `~/.claude/plans/archive/orange-flexpay-removal.shipped.md` — **Orange + AT SMS + Flexpay removal**, executed in PRs #221–#236 (May 25–26, 2026). **Do not re-execute.** See "Recently completed — 2026-05-25 → 2026-05-26" above for the full PR list and decisions captured for maintainers.
- `~/.claude/plans/archive/partitioned-nibbling-spark.shipped.md` — Rakuten redesign, executed in PRs #67–#73. **Do not re-execute.** Plan files in `~/.claude/plans/archive/` with `.shipped.md` are historical — read for context only.

> Other untouched files in `~/.claude/plans/` (e.g. `calm-soaring-emerson.md`, `fix-ios-push-mighty-nebula.md`) have unknown status. They are not necessarily in-flight — cross-reference against git log + this file before treating one as a backlog item.
