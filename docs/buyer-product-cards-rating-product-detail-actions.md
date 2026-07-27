# Buyer product cards, ratings, and product-detail actions

## Status

- [x] Reproduce and fix the Home product-card rating overlap.
- [x] Audit every Buyer Mobile use of the shared product card.
- [x] Introduce purposeful discovery and catalog card variants without duplicating business logic.
- [x] Replace the oversized product-detail Favorites and Partager buttons with compact icon actions.
- [x] Add a visible product-detail rating summary linked to the reviews page.
- [x] Preserve wishlist authentication, optimistic updates, sharing, and canonical public links.
- [x] Review Buyer Web card, product-detail, and SEO behavior for consistency.
- [x] Add narrow-width, long-content, and 200% text-scale widget coverage.
- [x] Verify representative logged-in Buyer Mobile screens on iOS.
- [x] Build and inspect Buyer Mobile on Android, including 200% system text.
- [ ] Complete final physical-device checks before release.

No Seller UI, API contract, database, or Buyer Web behavior was changed for this task.

## Root cause and reproduction

The overlap was caused by a parent/child sizing mismatch in the horizontal Home shelves. A typical card was constrained to about `160 × 280` logical pixels. The square image consumed 160 pixels, leaving 120 pixels for the footer; after vertical padding, only about 98 pixels remained.

The footer could still render seller metadata, a two-line title, price, old price, a separate savings row, and rating/review count. Those optional rows were taller than the fixed remaining space, especially with long French content, large review counts, discounts, official sellers, sold-out labels, or increased text scale. A spacer inside that fixed parent made the collision appear near the rating row rather than allowing the card to request the height it needed.

The issue can be reproduced most reliably with:

1. A narrow Home shelf card around 138–160 logical pixels wide.
2. A long product and seller name.
3. An official seller, old price, discount, rating, and five-digit review count.
4. System text at 200%.

## Card architecture and layout decision

`ProductCard` remains the single source of truth for navigation, wishlist behavior, badges, image handling, price formatting, ratings, and accessibility. It now accepts a small presentation enum:

- `ProductCardVariant.discovery` — used in fast-scanning shelves: Home Promotions, Produits populaires, Nouveautés, recently viewed products, and related products.
- `ProductCardVariant.catalog` — used where comparison detail matters: Search, Categories, Favorites, and the full Promotions listing.

Both variants keep a stable square image. Shared sizing helpers calculate the required parent extent from image width, variant footer height, and the current text scale. Grid and row skeletons use the same sizing contract, so loading and loaded layouts do not jump between incompatible aspect ratios.

The discovery variant omits seller metadata. The catalog variant keeps concise seller/official information. Both variants preserve:

- a maximum two-line title;
- a compact rating line using a French decimal comma and `(<count> avis)`;
- price, optional old price, and discount badge;
- sold-out state and wishlist action;
- 44 × 44 logical-pixel wishlist touch target;
- semantic labels for the full title and rating.

The separate “Vous économisez” row was removed from cards because it repeated information already communicated by the old price and discount badge. Normal card prices use the primary foreground color; red is reserved for discounted card prices, discounts, favorites, and selected navigation. On Product Detail, the current price always uses the primary foreground color so its treatment does not change when a discount is present. Ratings remain amber and surfaces remain neutral.

## Product-detail actions and rating

The labeled Favorites and Partager buttons below the gallery were removed. The product title now owns the full summary width. A compact secondary row places the overall rating at the left and the actions at the right:

- two circular, icon-only 44 × 44 actions beside the overall rating;
- heart state and tooltip/semantics remain explicit;
- share retains native sharing and its iPad origin;
- share content includes the product title and canonical public URL;
- the wishlist still resolves the product UUID, requires authentication, updates optimistically, rolls back on failure, and synchronizes providers.

The top rating summary sits directly below the title. It shows an amber star followed by content such as `4,6 · 128 avis`, uses `Aucun avis` when appropriate, and never invents a `0,0` rating. Tapping the summary opens the established `/products/:productId/reviews` route.

The summary and the detailed review section watch the same `reviewsProvider(product.id)`, so Riverpod reuses one cached request instead of issuing a duplicate review fetch.

Public share URLs now require an API-provided slug or short code. A database UUID is no longer exposed as a fallback; if no public identifier is available, the existing safe French error state is shown.

## Buyer Mobile inventory

Updated shared-card consumers:

- Home promotional, popular, and newest shelves.
- Search results.
- Category product listings.
- Favorites.
- Full promotions listing.
- Recently viewed products.
- Product-detail related products.

Additional large-text refinements found during live Android review:

- navigation microcopy is visually capped at a readable scale while retaining full semantic labels;
- the Home city chip uses the same approach, preventing its label and chevron from colliding at 200%.

Logged-in iOS review covered Home, Favorites, Categories/category products, product detail, and Account. The Account screen was inspected but not retained as a screenshot because it contained personal information.

## Buyer Web review

Buyer Web already uses one shared `product-card.tsx` component across grid and carousel contexts. Its square image, full-height flex layout, clamped title, wrapping price row, and semantic rating do not reproduce the mobile overflow. The parent container provides context-specific sizing, so duplicating the new Flutter enum in React would add complexity without improving the layout.

The web product page keeps its established desktop composition, reviews anchor, wishlist placement, canonical metadata, Open Graph data, and accurate `AggregateRating` structured data when reviews exist. No SEO or sharing contract was changed.

A compact top-of-page web rating/share treatment may be considered later as a separate parity enhancement; it is not needed to fix the Buyer Mobile defect.

## Files changed for this work

- `apps/buyer-mobile/lib/features/catalog/presentation/widgets/product_card.dart`
- `apps/buyer-mobile/lib/core/widgets/product_skeletons.dart`
- `apps/buyer-mobile/lib/features/home/presentation/home_screen.dart`
- `apps/buyer-mobile/lib/features/catalog/presentation/widgets/recently_viewed_section.dart`
- `apps/buyer-mobile/lib/features/catalog/presentation/screens/search_screen.dart`
- `apps/buyer-mobile/lib/features/catalog/presentation/screens/category_screen.dart`
- `apps/buyer-mobile/lib/features/catalog/presentation/screens/promotions_screen.dart`
- `apps/buyer-mobile/lib/features/wishlist/presentation/screens/wishlist_screen.dart`
- `apps/buyer-mobile/lib/features/catalog/presentation/screens/product_detail_screen.dart`
- `apps/buyer-mobile/lib/core/deep_link/web_links.dart`
- `apps/buyer-mobile/lib/core/router/main_shell.dart`
- `apps/buyer-mobile/test/catalog/product_card_layout_test.dart`
- `apps/buyer-mobile/test/catalog/product_detail_summary_test.dart`

The repository already contained other uncommitted Buyer Mobile work before this task. Those changes were preserved.

## Verification

Automated:

- `flutter test test/catalog/product_card_layout_test.dart test/catalog/product_detail_summary_test.dart test/catalog/product_model_test.dart test/wishlist/wishlist_provider_test.dart test/router/protected_route_test.dart test/core/deep_link/deep_link_parser_test.dart test/core/widgets/commerce_header_test.dart`
- `flutter analyze --no-fatal-infos lib test`

All 40 selected tests pass. The product-card tests exercise a 320-pixel viewport, 138-pixel-wide cards, long French content, official metadata, discount and old price, sold-out state, a 12,345-review rating, discovery/catalog differences, wishlist semantics, and 200% text scaling. Product-detail tests cover icon-only actions, canonical URL/UUID safety, rated summary, no-review state, and review navigation. Existing wishlist state, protected-route, deep-link, and commerce-header tests are included in the regression selection. Analysis reports no errors or warnings; eight pre-existing deprecation notices remain as informational findings.

Manual:

- iPhone simulator, production flavor, logged-in session: build and launch succeeded; real production content verified the new rating/action composition and representative authenticated screens.
- Android 14 emulator, production flavor: Gradle build and install succeeded; cached/offline card layout and 200% system text were inspected.

Non-sensitive captures are stored in `docs/screenshots/`:

- `buyer-cards-pdp-ios-home.png`
- `buyer-cards-pdp-ios-favorites.png`
- `buyer-cards-pdp-ios-product-detail.png`
- `buyer-cards-pdp-ios-product-detail-refined.png`
- `buyer-cards-pdp-ios-categories.png`
- `buyer-cards-pdp-ios-category-products.png`
- `buyer-cards-pdp-android-home.png`
- `buyer-cards-pdp-android-large-text.png`

## Remaining release checks and known observations

- Verify Home, Search, Category, Favorites, and product detail on at least one physical iPhone and one physical Android device, including 200% text, before release.
- The Android emulator could not establish a connection to the production API during this review; requests timed out. The production build installed correctly, cached/offline layouts were inspectable, and platform-neutral widget tests cover the changed card/PDP layout.
- The iOS run logged an existing push initialization warning stating that iOS settings must be supplied. It is unrelated to this UI work and should be handled by the push-notification owner.
- A plain repository-wide `flutter analyze` also enters generated/vendor code under `build/ios/SourcePackages/firebase_messaging`; use the app-owned `flutter analyze lib test` result for this change.

## Resume and delivery

No commit, branch, pull request, or merge was created. To resume:

1. Review the screenshots and this document.
2. Run the two verification commands above from `apps/buyer-mobile`.
3. Complete the physical-device checks.
4. Commit only the intended files after separating them from the pre-existing dirty worktree.
