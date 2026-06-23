# Buyer-Mobile UX/UI Redesign + Navigation Overhaul (2026-06-22)

Authoritative reference for the buyer-mobile navigation + visual redesign. Audit findings, root-cause
analyses, and the decisions that shaped the implementation.

## Goals

Transform the functional-but-dated buyer app into a modern, clean, conversion-focused ecommerce app
(Jumia/Amazon/Takealot-class) **without** a global refactor or any change to APIs, business logic,
analytics, auth flows, or the town architecture.

## Steps

### Step 1 — Remove the localization machinery (SHIPPED, PR #422)

The platform is French-only. The gen-l10n/`AppLocalizations` layer was removed from buyer-mobile: ~272
`l10n.*` calls across 27 files inlined as plain French literals; `lib/l10n/`, `locale_provider.dart`,
`l10n.yaml` deleted; `generate: true` + the `AppLocalizations` delegate dropped (framework
`GlobalMaterialLocalizations` stays pinned to `fr`). CLAUDE.md Rule 1 rewritten. This was a prerequisite
clean base, not part of the visual redesign. seller-mobile + web are separate follow-ups.

### Step 2 — Navigation + visual redesign (this initiative)

**Navigation architecture (user decision 2026-06-22).** A persistent bottom navigation built on
`StatefulShellRoute.indexedStack` (`lib/core/router/main_shell.dart`), with one navigator per branch so
each tab keeps its own stack + scroll position:

| Tab | Route | Notes |
|---|---|---|
| Accueil | `/` | Home feed |
| Categories | `/categories` | New browse-all grid (`categories_screen.dart`) |
| Favoris | `/wishlist` | Wishlist — now a **top-level tab** |
| Panier | `/cart` | Cart, with item-count badge |
| Compte | `/profile` | Account (Orders live here, not a tab) |

- **Search is NOT a tab** — it is an action. A prominent tappable search bar sits at the top of the Home
  feed and opens the full search screen (`/search`).
- **Orders is NOT a tab** — reached from Compte → "Mes commandes".
- **Full-screen flows live ABOVE the shell** (own back button, no bottom bar): product detail, search,
  checkout, auth, city selection, notifications, content pages, category listings, order detail.

**Favorites back-button bug — root cause + fix.** `WishlistScreen`'s AppBar used the default
`automaticallyImplyLeading: true`, so the arrow appeared only when a parent existed on the stack. Reached
via `context.push('/wishlist')` (Home/Profile) the stack was `[Home, Wishlist]` → arrow shown; reached via
`context.go(returnTo)` after login, `go()` **replaced** the stack → `[Wishlist]` as root → no arrow. Same
screen, two stacks, inconsistent chrome. **Fixed by construction:** Favorites is now a top-level tab
destination — tabs never show a back arrow, and post-login the user lands on the *tab*. Consistent every
time.

**Guest → login is never a dead end.** Tapping a protected tab (Favoris/Panier/Compte) as a guest
redirects to the WhatsApp login (full-screen, no bottom bar) with `returnToRouteProvider` set so login
returns to the originating tab/action. The login entry screen (`otp_request_screen.dart`) gained a **✕
close button** → returns to Home, so a guest is never stranded on login (honours "always a path back").

**AppBar simplification (Home).** Was: logo + town + wishlist + cart + search + profile (6 targets). Now:
brand + town pill + a single **notification bell** (`/notifications`). The bell opens a Notifications
centre (`notifications_screen.dart`) — today an informative empty state (order updates / promos / broadcasts
arrive via push; no in-app feed endpoint yet) that gives a future unread badge a home.

**"Too red" rebalance.** The global AppBar theme went from a full-width brand-red block to a **clean white
bar** (dark foreground, dark status-bar icons, hairline scroll shadow). Red is now reserved for CTAs,
prices, badges, the bottom-nav selected state, and accents — not background-duty. `NavigationBarTheme`
added (white surface, subtle red selected indicator/label/icon).

**Home feed order.** Search bar → city hero → banner → Categories → Produits populaires → Nouveautés →
Ventes flash → Vus récemment.

## Preserved (no change)

APIs, business logic, town architecture (city-scoped browse/search + town pill + accents), guest browsing
gates (`isProtectedRoute` unchanged), analytics (PostHog `$screen` capture preserved by adding
`PosthogObserver` to each shell branch; Sentry untouched), auth flows, error mapping
(`dio_error_messages.dart`). Push deep-links (`/orders/:id`, `/products/:id`) still resolve as top-level
routes.

## Verification

`flutter analyze lib` → 0 errors (pre-existing info-level deprecations only); `flutter test` → 93 passing.
Device-verified on the Android emulator (production flavor, Kolwezi): redesigned Home, Categories tab,
guest→protected-tab→login redirect + ✕ close, white AppBar / bottom nav.

### Step 3 — Shared states + product-grid consistency (SHIPPED)

- **Shared widgets** (`lib/core/widgets/`): `AppEmptyState` (icon + title + optional message + CTA) and
  `AppErrorState` (icon + friendly message + Réessayer) replace the ad-hoc empty/error columns each screen
  re-implemented; `product_skeletons.dart` adds a dependency-free `ShimmerBox` + `ProductCardSkeleton` /
  `ProductGridSkeleton` / `ProductRowSkeleton` so loading product grids/rows show **content-shaped shimmer
  placeholders** instead of a bare spinner (important on DRC 2G/3G).
- **Wired:** Home (populaires row + nouveautés grid skeletons), Category + Search (grid skeleton + AppEmpty/
  AppError + retry), Wishlist (grid skeleton + AppEmpty/AppError), Orders + Cart (AppEmptyState; list spinner
  kept). Removed the now-unused `_EmptyCartView`/`_EmptyWishlistView`/`_EmptyOrdersView`.
- **Product-grid consistency:** all product grids now share `kProductCardAspectRatio = 0.62` (was 0.6 home vs
  0.65 category/search → cards had different heights per screen).
- **Error-mapping note:** the audit's "raw `state.error!`" finding was already addressed — the shopping
  providers map errors via `friendlyErrorMessage`/`extractDioErrorMessage`, so `state.error` is already
  user-safe French; `AppErrorState` just renders it consistently with a retry.

## Deferred follow-ups

- seller-mobile l10n removal; web next-intl removal.
- In-app notification feed API → wire the bell's unread badge.
