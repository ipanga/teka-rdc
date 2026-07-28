# Buyer Mobile Sticky Search and Visual Refinement

**Initiative date:** 2026-07-27
**Target branch:** `develop`
**Primary surface:** `apps/buyer-mobile`

This is the resumability log for the Buyer Mobile commerce-header, Product
Detail action-placement, and targeted visual-consistency work. It is updated as
implementation and verification progress.

## Status and checklist

- [x] Read the supplied brief and the two eBay behavior references.
- [x] Confirm repository status and current branch (`develop`, clean at start).
- [x] Map Buyer Mobile navigation and root/shell route ownership.
- [x] Locate the existing search route, suggestions, recent searches, analytics,
      and town-scoped query behavior.
- [x] Audit Home, Categories, Category listing, Search results, promotions, and
      Product Detail headers.
- [x] Audit the global theme and representative typography overrides.
- [x] Confirm Product Detail share/favorite behavior and resolved-product UUID
      requirements.
- [x] Introduce reusable commerce search/header widgets.
- [x] Make Home search collapsible and pinned.
- [x] Add persistent search to category and product-collection screens.
- [x] Redesign Product Detail header and move share/favorite into content.
- [x] Refine the shared typography scale.
- [x] Add focused widget tests.
- [x] Run Dart formatting, Flutter analysis, and the Buyer Mobile test suite.
- [x] Run available iOS/Android emulator checks and capture results.
- [x] Complete Buyer Web/shared-contract parity review.
- [x] Re-run iOS visual QA with an authenticated buyer account.
- [x] Refine the Product Detail content actions after reviewing the real iPhone
      render.

## Screenshots reviewed

- `Before scroll.jpeg`: eBay reference with brand/cart above a full search field.
- `After Scroll.jpeg`: eBay reference with a compact pinned search field and cart.

The screenshots are behavior references only. Teka retains its own wordmark,
Modern Ruby accent, town context, notifications, French labels, and existing
navigation.

Implementation QA captures:

- `docs/screenshots/buyer-mobile-sticky-search/android-home-expanded.png`
- `docs/screenshots/buyer-mobile-sticky-search/android-home-collapsed.png`
- `docs/screenshots/buyer-mobile-sticky-search/android-categories-root.png`
- `docs/screenshots/buyer-mobile-sticky-search/ios-city-selection-safe-area.png`
- `docs/screenshots/buyer-mobile-sticky-search/ios-product-detail-compact-actions.png`

## Code-grounded audit

### Navigation

`app_router.dart` uses a root navigator for category listings, search, Product
Detail, checkout, orders, notifications, and other full-screen flows. A
`StatefulShellRoute.indexedStack` owns the five persistent tabs: Home,
Categories, Favorites, Cart, and Account. Search is correctly modeled as an
action at `/search`, not as a tab.

Opening search with `context.push('/search')` preserves the caller's navigation
stack and therefore satisfies Product Detail cancellation/back behavior,
including Product Detail entered from notifications, orders, cart, and deep
links. No new route or search provider is required.

### Search

`SearchScreen` already owns:

- initial deep-link queries;
- 500 ms input debounce;
- town-scoped results and suggestions;
- category and brand suggestions;
- local recent searches;
- popular searches;
- query clearing and keyboard search submission;
- PostHog `search_performed` and `zero_results` events.

The header work must route into this screen and must not duplicate any of this
logic.

### Current header behavior

- **Home:** white AppBar with Teka/town and notifications. Search is the first
  ordinary `ListView` child, so it scrolls away.
- **Categories tab:** title-only AppBar; no search access.
- **Category listing:** title and filter button in the AppBar; no search or cart.
- **Search:** persistent AppBar containing the live query field; no cart shortcut.
- **Promotions:** title-only AppBar.
- **Product Detail:** title plus share and favorite in the AppBar; no search/cart.
- **Cart/Favorites/Profile/Orders/Help/Auth:** these are task-, account-, or
  transaction-oriented screens. A commerce search header would add noise and is
  not planned unless a later usability test provides evidence.

### Theme and typography

The app uses Material 3, platform typography, and shared Teka color tokens.
There is no need for a new font dependency. The global theme currently changes
only text color; many screens compensate with local sizes and weights. This
creates inconsistent hierarchy. The safe refinement is an explicit global
Material text scale using the existing platform font while retaining all
dynamic text scaling.

### Product Detail actions

Share already builds the canonical web/deep-link URL, records PostHog, anchors
the iPad/macOS share popover, reports failure to Sentry, and shows a French
error. Favorite correctly uses the resolved UUID and gates guests through the
existing auth flow. Only placement/presentation should change.

## Design decisions

1. Add a reusable, semantics-aware `CommerceSearchButton`, cart action, compact
   `CommerceAppBar`, and collapsible `HomeCommerceHeader`.
2. Home uses a pinned sliver header. Expanded state keeps the Teka wordmark,
   town selector, and notifications; collapsed state prioritizes search and
   cart. The transition is driven only by scroll extent (no controller-driven
   animation or API rebuild).
3. Category/listing/Product Detail screens use a compact fixed commerce header:
   back where required, search in the center, cart on the right. Category title
   and filters remain visible immediately below it without a duplicate AppBar.
4. Search results keep the real editable search field and gain only the shared
   cart action.
5. Product Detail share/favorite move to a labeled action row immediately below
   the image gallery. The favorite icon continues to show selected state.
6. Apply commerce headers to Home, Categories, category listings, promotions,
   Search, and Product Detail. Do not apply them to checkout, orders, account,
   help, notifications, authentication, forms, dialogs, or sheets.
7. Keep all UI labels French and preserve `formatCDF` (`FC`, dot thousands
   separators).

## Implemented behavior

### Home

Home now uses one `CustomScrollView` with a pinned
`SliverPersistentHeader`. The maximum and minimum extents include the current
platform safe-area inset. Scroll extent alone drives the short cross-fade and
position interpolation:

- expanded: Teka wordmark, selected town, notifications, full search;
- collapsed: compact search and cart;
- pinned extent: 66 logical pixels plus the status-bar inset.

There is no second scroll controller, animation controller, provider, route, or
API request. The existing controller still owns scroll-to-top behavior and the
existing `RefreshIndicator` still wraps the complete feed.

### Listings and Product Detail

`CommerceAppBar` provides a consistent 64-pixel commerce bar:

- root Categories: search + cart, no back affordance;
- Category, Promotions, Product Detail: back + search + cart;
- Search results: existing editable query field + shared cart action.

Category title and the filter-count control moved into a dedicated context row
below the commerce bar. Condition chips now scroll horizontally, preventing
overflow on narrow screens and at larger text sizes.

Product Detail now renders two compact, labeled content actions immediately
below the gallery:

- Favorite continues to show selected state and uses the resolved product UUID;
- Share keeps the canonical URL, PostHog event, iPad/macOS popover origin,
  Sentry reporting, and French error feedback.
- Both actions size to their content instead of splitting the full screen width.
  They use 19-pixel icons, 40-pixel visual controls, lightweight transparent
  surfaces, and Material's padded tap target. This makes them clearly secondary
  to the title, price, and red add-to-cart CTA while preserving accessibility.

The prior share/favorite AppBar actions were removed, so neither action is
duplicated.

The authenticated iOS review also corrected visible French accents in order
filters, order-status badges, pagination, and payment-status labels. Status
colors remain semantic (green for success and amber for pending); red remains
the only brand/primary-action color. No broad palette change was justified by
the device review.

### Typography

`AppTheme` now defines one explicit Material text scale for display, headline,
title, body, and label roles. It:

- keeps the existing platform font (no dependency or runtime font download);
- uses a restrained 400/600/700 weight hierarchy;
- provides consistent line heights for French wrapping;
- preserves Flutter's dynamic `TextScaler`;
- leaves semantic color tokens unchanged.

Product Detail price metadata now uses a wrapping layout so a long CDF amount,
old price, and discount badge cannot overflow a narrow screen.

### Security hardening discovered during QA

The existing Dio debug logger printed request headers and bodies, including
bearer authorization headers. It was tightened to log request/response/error
metadata only. Header and body logging is now explicitly disabled. Repository
Rule 15 requires the mobile network trees to remain mirrored, so this one
shared-network correction was applied byte-for-byte to Buyer Mobile and Seller
Mobile; no Seller UI or workflow changed.

## Screens audited

| Screen group | Header decision | Visual/typography decision |
|---|---|---|
| Home | Collapsible pinned search; expanded brand/town/notifications; compact cart | Shared theme hierarchy |
| Categories | Fixed search + cart; no back (root tab) | Preserve overview cards |
| Category listing | Back + search + cart; category/filter context below | Make condition chips horizontally safe |
| Search/results | Keep editable field pinned; add cart | Preserve query/suggestions/analytics |
| Promotions/collections | Back + search + cart | Preserve product grid |
| Product Detail | Back + search + cart | Labeled content actions; clearer price hierarchy |
| Cart/Checkout | No commerce header change | Transaction focus |
| Orders/Order Detail | No commerce header change | Task focus; polished French status labels |
| Favorites | No header change; search/cart already available via tab navigation | Existing consistent grid |
| Account/Help/Notifications/Auth | No commerce header change | Account/content focus |

## Buyer Web and shared contracts

Review confirmed no shared API, model, route, analytics contract, or SEO change
is required:

- Buyer Web already has a sticky semantic `<header>` with its existing search,
  city, account, and cart behavior.
- Buyer Web Product Detail already places Favorite beside the product title in
  content rather than global navigation.
- Buyer Web already uses Inter with system fallbacks and a clear product-price
  hierarchy. Flutter intentionally keeps platform typography for deterministic
  offline rendering.
- No Next.js file was changed, so metadata, canonical URLs, structured data,
  Open Graph, crawlability, and Core Web Vitals behavior are untouched.
- Sentry and PostHog code paths were preserved; no event name or payload was
  changed.

## Files changed

- `apps/buyer-mobile/lib/core/widgets/commerce_header.dart` (new reusable
  search/cart/compact/collapsible headers)
- `apps/buyer-mobile/lib/core/network/api_client.dart` (disable private
  header/body logging)
- `apps/buyer-mobile/lib/core/theme/app_theme.dart`
- `apps/buyer-mobile/lib/features/home/presentation/home_screen.dart`
- `apps/buyer-mobile/lib/features/catalog/presentation/screens/categories_screen.dart`
- `apps/buyer-mobile/lib/features/catalog/presentation/screens/category_screen.dart`
- `apps/buyer-mobile/lib/features/catalog/presentation/screens/search_screen.dart`
- `apps/buyer-mobile/lib/features/catalog/presentation/screens/promotions_screen.dart`
- `apps/buyer-mobile/lib/features/catalog/presentation/screens/product_detail_screen.dart`
- `apps/buyer-mobile/lib/features/wishlist/presentation/widgets/wishlist_button.dart`
- `apps/buyer-mobile/lib/features/orders/presentation/screens/orders_screen.dart`
- `apps/buyer-mobile/lib/features/orders/presentation/screens/order_detail_screen.dart`
- `apps/buyer-mobile/lib/features/orders/presentation/widgets/order_status_badge.dart`
- `apps/buyer-mobile/test/core/widgets/commerce_header_test.dart` (new)
- `apps/seller-mobile/lib/core/network/api_client.dart` (required byte-for-byte
  mirror of the logger hardening)
- `docs/screenshots/buyer-mobile-sticky-search/` (four QA captures)
- `docs/buyer-mobile-sticky-search-visual-refinement.md` (this log)

No Buyer Web, API, shared-package, Seller UI, or admin file changed.

## Tests and device results

### Automated

- `dart format` on all touched Dart files: clean.
- `flutter analyze --no-fatal-infos lib test`: exit 0; no errors or warnings.
  Eight unrelated, pre-existing deprecation infos remain in secure storage,
  filter radio controls, and checkout.
- `flutter test test/core/widgets/commerce_header_test.dart`: 3/3 passed.
- `flutter test`: 167/167 passed.
- Buyer and Seller `core/network/api_client.dart` targeted analyses: no issues;
  files confirmed byte-for-byte identical.
- New widget coverage verifies pinned search after scroll, callback routing,
  expanded-context collapse, 2× text scaling without overflow, and the search
  button's accessible tap semantic.

### Android Emulator

Device: `sdk gphone64 arm64`, Android 14 / API 34.

- Production debug APK built and installed successfully.
- Home expanded header visually verified.
- Home collapsed search/cart header visually verified after scroll.
- Bottom navigation remained fixed while the Home header collapsed.
- Categories root search/cart header verified with no back arrow.
- No Flutter overflow/error appeared during the observed header transition.
- Startup reported skipped frames while Firebase/auth/network initialization
  ran; this was outside the header transition and was not treated as a header
  performance measurement.
- The production API timed out during the pass. Cached Home content and
  offline/error states rendered correctly, but live category listing, live
  search suggestions/results, and loaded Product Detail action content could
  not be device-verified.

### iOS Simulator

Device: iPhone 17 Pro, iOS 26.4 simulator.

- `flutter build ios --simulator --flavor production
  --dart-define-from-file=flavors/production.json`: succeeded.
- Xcode simulator build completed in 113 seconds.
- App installed and launched successfully.
- Fresh-install city selection and Dynamic Island safe-area layout rendered
  correctly.
- A signed-in follow-up pass reviewed the live Home, Favorites grid, Cart empty
  state, Account, Orders, Notifications, and loaded Product Detail screens.
- Favorites, Account, Orders, and Notifications loaded authenticated API data
  without overflow or hierarchy regressions. Their neutral surfaces remain
  consistent and red is reserved for brand selection, prices, and primary
  actions.
- The first Product Detail render confirmed that its two 48-pixel, half-width
  outlined buttons were visually too dominant. They were replaced with compact
  intrinsic-width tertiary actions and re-verified in the real simulator.
- The updated Product Detail capture is
  `ios-product-detail-compact-actions.png`. It shows the actions no longer
  competing with the product title, discount price, or sticky red cart CTA.
- A temporary QA-only Product Detail initial route was used after macOS revoked
  assistive access during the rebuild. The route was restored to `/`, the saved
  final production build was reinstalled, and normal Home launch was
  re-verified.

### Physical device

Not run. A physical iPhone was visible wirelessly, but installing/testing on a
personal device was not assumed. A physical iPhone and a common physical
Android phone remain required for final release sign-off.

## Accessibility and performance findings

- Search uses a single replacement semantic with label, hint, button role, and
  tap action; descendant text is excluded to prevent duplicate announcements.
- Search, cart, and filter meet or exceed 44×44 logical-pixel targets. The
  compact Product Detail actions have 40-pixel visual surfaces inside
  Material's padded tap targets, so the apparent controls are smaller without
  shrinking the accessible hit region.
- Favorite exposes selected semantics in its labeled Product Detail form.
- Search labels truncate safely; category title truncates; condition filters
  scroll; Product Detail price metadata wraps.
- Widget verification at 2× text scaling found no header overflow.
- The pinned header uses a constant delegate and scroll geometry only. It adds
  no API calls, provider duplication, image reload, or controller-driven
  animation.
- A full Flutter performance profile was not captured; physical-device
  profiling remains recommended before release.

## Risks and rollback

- The highest regression risk is sliver geometry on small devices and at large
  text sizes. Focused widget tests and Android emulator scrolling are green;
  iOS sticky-header and physical-device passes remain.
- Product Detail action behavior remains unchanged while its widget placement
  and visual density change.
- Rollback is isolated: remove the reusable header widget and restore the
  affected screens' prior AppBars/ListView search child. No data migration,
  API, or persisted-state change is involved.

## Unresolved items

- Re-run live-data visual checks for Category top/scrolled, Search results,
  populated Cart/Checkout, and Help.
- Verify the Home sticky transition on a small iPhone, large iPhone, narrow
  Android, common Android, and both platforms with the OS text-size control
  increased.
- Verify Product Detail entered from Home, Category, Cart, Order Detail,
  Notification, and a real Universal/App Link. Search should push and return to
  the same Product Detail stack.
- Verify the share sheet and favorite add/remove behavior on signed-in and
  signed-out physical devices. The signed-in visual state and existing
  providers/routes were verified, but macOS assistive access was unavailable
  for the final interaction pass.
- Capture a Flutter performance profile on a release/profile physical device.
- Commit and PR references: none yet.

## Exact resume instructions

1. Read this file and inspect `git status --short`.
2. Confirm `https://api.teka.cd/api/v1/cities` and browse endpoints are
   reachable before starting the remaining visual pass.
3. Use the production flavor commands recorded above on iOS/Android.
4. Work through every item in **Unresolved items**, adding screenshots under
   `docs/screenshots/buyer-mobile-sticky-search/`.
5. If code changes, run `dart format`, then from `apps/buyer-mobile` run
   `flutter analyze --no-fatal-infos lib test` and `flutter test`.
6. Record exact commands, pass counts, device names, remaining overflows, and
   screenshot paths here.
7. Create small reviewable commits/PRs into `develop`; do not merge to `main`.
