# Buyer Mobile PDP + Splash Refinement

**Started:** 2026-09-01  
**Primary surface:** `apps/buyer-mobile`  
**Status:** In progress

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
- [ ] Splash asset/configuration implementation
- [ ] iOS cold-launch review
- [ ] Android PDP and splash review
- [ ] Full Buyer Mobile analyzer/test regression pass
- [ ] Cart-clear and single-address regression tests
- [ ] Final diff review and initiative closure

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

## Known constraints and risks

- Production data is read-only during QA; no review, cart, checkout, or address writes will be made.
- Product-state coverage beyond live catalog examples will use widget tests with controlled models.
- Native splash assets must be regenerated from configuration and checked into both platform projects;
  editing only the source PNG is insufficient.
