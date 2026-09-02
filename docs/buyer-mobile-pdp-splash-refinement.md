# Buyer Mobile PDP + Splash Refinement

**Started:** 2026-09-01
**Primary surface:** `apps/buyer-mobile`
**Status:** Complete on `develop`; not released

## Objective

Refine the Buyer Mobile product detail and native launch experiences without changing APIs, business
rules, navigation contracts, analytics, cart behavior, checkout, address behavior, or Buyer Web SEO.

## Baseline established

- Repository started clean on `develop` at `bc3487b`.
- Existing Buyer Mobile design system is intentional and mature: Material 3, Modern Ruby brand tokens,
  one shared typography scale, shared commerce headers, common product cards, skeletons, empty states,
  and error states. A global redesign is not justified.
- The production-flavor app was rendered on an iPhone 16 Pro simulator against `api.teka.cd`.
- The live PDP baseline confirmed:
  - the mobile breadcrumb consumes a redundant line above the title;
  - the square gallery keeps images uncropped but dominates the first viewport;
  - the title, price, ratings, favorite/share actions, stock state, seller, reviews, related products,
    full-screen gallery, and cart-state-aware CTA already work and should be preserved;
  - payment and delivery assurances are pinned above the CTA, making the sticky purchase area taller
    than necessary;
  - the initial PDP loading state is a bare spinner despite the app's content-shaped skeleton system.
- Cold-launch frames confirmed the native iOS wordmark is generated at 300 pt wide from a 1200x240
  raster. The source is sufficiently sharp, but the intrinsic generated size makes it visually dominant
  and exposes softness. There is no Flutter-side splash and no artificial delay.
- Android pre-12 uses the same 300 dp-wide wordmark. Android 12+ uses a white `T` foreground on a white
  background, which is clean but effectively invisible rather than a useful brand mark.

## Implementation decisions

1. Remove only the Buyer Mobile PDP breadcrumb; leave Buyer Web untouched.
2. Keep product images uncropped, but use a slightly shorter gallery, content-shaped loading, accessible
   image semantics, and an overlaid image counter so the gallery does not add a separate indicator row.
3. Keep the existing title/price/rating/action hierarchy and all resolved-UUID behavior.
4. Move COD and Teka-delivery assurances into the scrollable product summary; keep only the cart action
   sticky so more product content remains visible.
5. Add a PDP-shaped skeleton and honor the platform's reduced-motion setting in shared shimmer boxes.
6. Generate a padded native splash asset whose visible wordmark is about 160 logical pixels wide while
   retaining density-specific raster output. Use the Android 12 icon-background facility for a compact
   white `T` on Modern Ruby.
7. Make no API, database, Buyer Web, seller/admin, analytics, or route changes.

## Phases

- [x] Investigation, source audit, and live iOS baseline
- [x] PDP implementation and widget regression coverage
- [x] PDP iOS visual review (standard + small viewport)
- [x] Splash asset/configuration implementation
- [x] iOS cold-launch review
- [x] Android PDP and splash review
- [x] Full Buyer Mobile analyzer/test regression pass
- [x] Cart-clear and single-address regression tests
- [x] Final diff review and initiative closure

## Validation log

- 2026-09-01: `flutter devices` found iPhone 16 Pro (iOS 18.5), iPhone 17 Pro (iOS 26.5), an Android 14
  emulator, and a wireless physical iPhone. No physical-device action is planned without explicit need.
- 2026-09-01: production-flavor app built and rendered on iPhone 16 Pro; live product deep link used a
  long-title, discounted, multi-image, reviewed, out-of-stock product.
- 2026-09-01: timed cold-launch stills and a short simulator recording captured the current oversized
  wordmark before any asset change.
- 2026-09-01: refined the PDP with a shorter uncropped gallery, overlaid image count, responsive summary,
  scrollable fulfilment assurances, a content-shaped reduced-motion-aware skeleton, and a compact
  cart-only sticky action area. Breadcrumbs were removed from Buyer Mobile only.
- 2026-09-01: focused PDP, section-order, skeleton, price, cart-clear, checkout, and address-management
  regression tests passed. A deliberate 320 px viewport at 2× text scaling exposed responsive issues in
  the rating, stock, seller, and review layouts; each was corrected and the accessibility test now passes.
- 2026-09-01: rendered the refined live PDP on iPhone 16 Pro and iPhone SE simulators. The small viewport
  keeps the gallery, long title, rating/actions, complete discounted price, savings, and stock action
  legible in the first screen without overflow.
- 2026-09-01: replaced the oversized native wordmark input with a 1200 px square density source whose
  visible mark is about 160 logical pixels wide. Regenerated iOS and Android assets; the density outputs
  remain 300/600/900 px on iOS and 300–1200 px on Android.
- 2026-09-01: fresh-install cold-launch recordings on iPhone 17 Pro and iPhone SE confirmed a sharp,
  centered, proportionate wordmark and a direct transition to Flutter with no second splash or delay.
- 2026-09-01: Android 14 visual inspection exposed the OS's Android 13+ default to permit an empty splash
  even when an icon is configured. Added the platform `icon_preferred` override for light and dark themes;
  the held system splash then visibly rendered the white T on Modern Ruby. A normal cold launch transitioned
  directly into the app, and the live long-title PDP rendered without clipping or sticky-action issues.
- 2026-09-01: the full Buyer Mobile suite passed: 225 tests, including cart-clear, checkout, and
  address-management coverage. `flutter analyze --no-fatal-infos lib test` passed with the repository's
  six known info-level deprecations; all seven changed Dart files are formatter-clean.
- 2026-09-01: final review caught `flutter_native_splash` regenerating explicit fullscreen/status-bar
  keys. The source config now keeps fullscreen disabled, generated keys were removed to preserve the
  existing system-UI contract, and the focused native tests plus the full suite passed afterward.
- 2026-09-01: final diff is Buyer Mobile-only: no API, database, Buyer Web, seller/admin, route,
  analytics, pricing, cart, checkout, or address logic changed. Buyer Web SEO is unaffected.

## Known constraints and risks

- Production data is read-only during QA; no review, cart, checkout, or address writes will be made.
- Product-state coverage beyond live catalog examples will use widget tests with controlled models.
- Native splash assets must be regenerated from configuration and checked into both platform projects;
  editing only the source PNG is insufficient. After generation, keep the explicit status-bar keys absent
  and retain the API 33+ `icon_preferred` sidecar themes; regression tests enforce both requirements.

## 2026-09-02 targeted layout follow-up

**Status:** Complete on `develop`; not released.

This follow-up intentionally changes only two PDP presentation details. The savings message and its
own padding are removed; current/original prices, the percentage badge, formatting, and calculations
stay intact. The existing rating/favorite/share row moves below stock status without changing any
action, provider, route, analytics, or shared component. Splash and other surfaces are untouched.

- [x] Inspect current PDP, state management, and existing widget coverage.
- [x] Remove the monetary-savings block; preserve an 8 px title-to-price gap and 12 px price-to-stock gap.
- [x] Move the single rating/actions row below stock with an 8 px gap; preserve touch targets.
- [x] Add six widget cases: discounted/regular × available/unavailable, favorite add/remove, native share payload/origin.
- [x] Format both changed Dart files; analyzer passes with the same six known info-level deprecations.
- [x] All 231 Buyer Mobile tests pass, including review navigation, cart, checkout, and address coverage.
- [x] Render and inspect discounted/regular, in/out-of-stock, and long-title states in iOS Simulator.
- [x] Verify moved favorite/share/review interactions and scrolling in the simulator.
- [x] Final diff review and scoped commit.

Visual QA used the real PDP and theme on iPhone 16 Pro (iOS 18.5) and iPhone SE (iOS 18.2), with
isolated in-memory catalog/review/wishlist/cart fixtures and a public product image. All four
discount/stock combinations rendered correctly; the small phone was also checked at 2× text scale.
No overflow or spacing regression was observed. The favorite icon toggled on/off, the rating opened
the actual reviews screen, and Share opened the native iOS sheet (nothing was sent). Scrolling and
the sticky action's SafeArea were inspected. Fixture instrumentation reported zero Flutter errors.
The temporary simulator-only entrypoint was removed after QA; no production data was changed.

Local screenshot evidence (ephemeral): `/tmp/teka-pdp-layout-discount-in-stock-iphone16.png`,
`/tmp/teka-pdp-layout-regular-in-stock-iphone16.png`,
`/tmp/teka-pdp-layout-discount-out-stock-iphone16.png`,
`/tmp/teka-pdp-layout-regular-out-stock-iphone16.png`,
`/tmp/teka-pdp-layout-discount-in-stock-iphone-se-scrolled.png`,
`/tmp/teka-pdp-layout-large-text-iphone-se.png`, and
`/tmp/teka-pdp-layout-share-sheet-iphone16.png`.

Final source comparison confirmed the moved row is identical except for its widget-test key and
occurs exactly once. No shared component, pricing model, API, Buyer Web/SEO, seller/admin, splash,
cart, checkout, address, or analytics code changed.
