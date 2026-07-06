# Mobile Navigation Audit — buyer-mobile + seller-mobile

**Initiative date:** 2026-07-06 · **Branch:** `fix/mobile-nav-traps` → PR into `develop`

Full navigation review of both Flutter apps, triggered by the buyer **"Mes commandes"**
screen appearing with no back button, no bottom bar, and no way out. Root-caused, fixed with
one reusable pattern, and audited across every screen so the class of bug can't recur.

## Navigation architecture (both apps)

go_router with **two layers**:

1. **Bottom-nav shell** (`StatefulShellRoute.indexedStack` → `core/router/main_shell.dart`).
   - buyer tabs: `/` `/categories` `/wishlist` `/cart` `/profile`
   - seller tabs: `/` `/orders` `/products` `/earnings` `/profile`
   - These show the persistent bottom bar → they are the "home base" and never need a back button.
2. **Full-screen root-navigator routes ABOVE the shell** (no bottom bar): product/category/
   search/checkout/orders/notifications/etc. By design these "cover the bar with their own back
   button" (see the `main_shell.dart` header comment).

### The root cause (the whole bug in one rule)

A root-navigator screen's back arrow only appears when `Navigator.canPop()` is true:

| Reached via | `canPop()` | Plain `AppBar` (no `leading`) shows | Result |
|---|---|---|---|
| `context.push('/x')` | true | back arrow | ✅ can go back |
| `context.go('/x')` | **false** (stack replaced) | **nothing** | 🔴 trapped: no back, no bar |

So any full-screen screen reached via `go()` — or a `push` onto a replaced stack — becomes a dead
end. Deep links / FCM taps use `.push()` (`deep_link_controller.dart:94`, `push_controller.dart:88`),
so those are safe; the traps were all `go()` entry points.

## The fix — one reusable widget

`core/widgets/adaptive_leading.dart` (added to **both** apps): `AdaptiveLeading` renders the
correct leading control for the situation — a **back arrow** when `canPop()` (pops), else a **Home
button** that `context.go(fallbackLocation)` (default `/`). Dropping it into an `AppBar.leading`
makes that screen trap-proof regardless of how it was reached. It is a safe superset of the default
behavior (identical for pushed screens; adds an exit for `go`-entered ones).

## Issues found & fixed

### buyer-mobile
| Screen | Verdict | Cause | Fix |
|---|---|---|---|
| `orders_screen` (Mes commandes) | 🔴 TRAP | `go('/orders')` from checkout success (`checkout_success_screen.dart:92`) + payment-pending (`payment_pending_screen.dart:265,315`) → no back, no bar | `leading: AdaptiveLeading()` (→ Home) |
| `payment_pending_screen` | 🔴 TRAP | `automaticallyImplyLeading: false` hard-blocked the back button; reached via `go` | replaced with `AdaptiveLeading()` |
| `order_detail_screen` | ⚠️ defensive | reachable from FCM taps | `AdaptiveLeading()` + fixed title ("Mes commandes" → "Détail de la commande") |
| `notifications_screen` | ⚠️ defensive | FCM tap target | `AdaptiveLeading()` |
| `checkout_success_screen` | ✅ OK | no AppBar, but has explicit **Accueil** + **Voir mes commandes** CTAs → not trapped (and Orders now exits safely) | no change |

### seller-mobile
| Screen | Verdict | Cause | Fix |
|---|---|---|---|
| `product_detail_screen` | 🔴 TRAP | `go('/products/:id')` after creating a product (`product_form_screen.dart:530`) → no back, and it is a root-nav route so no bottom bar either | `AdaptiveLeading(fallbackLocation: '/products')` + fixed title ("Produits" → "Détail du produit") |
| `order_detail_screen` | ⚠️ defensive | notification deep-link target | `AdaptiveLeading()` + fixed title ("Commandes" → "Détail de la commande") |
| `notifications_screen` | ⚠️ defensive | FCM tap target | `AdaptiveLeading()` |

### Screens confirmed OK (no change)
Shell tabs (bottom bar = exit); all browsing/detail screens reached via `push` (category, search,
promotions, product detail, product reviews, content pages); auth screens (`otp_request` has an
explicit close button; `otp_verify` owns its post-auth pop/go logic); seller add/edit product,
create promotion, request payout (all push→pop); seller auth + onboarding (correct `go` redirects).

## Navigation decisions

- **Home fallback, not push-rewrite.** Post-checkout / post-create flows intentionally use `go`
  (you must not be able to "go back" into a completed checkout or a submitted form). So the fix is
  a safe **exit affordance** on the destination, not converting `go`→`push`. When Orders is opened
  from Profile (push) the control is a back arrow; from checkout (go) it's a Home button — each
  matches what actually happens.
- **Seller product-detail falls back to `/products`** (its natural parent — the list, refreshed
  with the new product) rather than the dashboard.
- **Titles corrected** where a list title was reused on a detail screen (misleading affordance).
- No router restructure, no `go`→`push` churn, no business-logic change. French UI throughout.

## Files changed
- **buyer-mobile:** `core/widgets/adaptive_leading.dart` (new); `features/orders/.../orders_screen.dart`,
  `.../order_detail_screen.dart`; `features/notifications/.../notifications_screen.dart`;
  `features/checkout/.../payment_pending_screen.dart`; `test/router/adaptive_leading_test.dart` (new).
- **seller-mobile:** `core/widgets/adaptive_leading.dart` (new); `features/products/.../product_detail_screen.dart`;
  `features/orders/.../order_detail_screen.dart`; `features/notifications/.../notifications_screen.dart`;
  `test/router/adaptive_leading_test.dart` (new).
- **web / API:** none — this is a mobile-only navigation concern; no shared route/state/API affected.

## Tests
- `test/router/adaptive_leading_test.dart` (both apps): pushed route → back arrow → pops to origin;
  `go()`-replaced route → Home button → routes to fallback. **Green in both apps.**
- `flutter analyze` clean on all touched files (only pre-existing `withOpacity` /
  `use_build_context_synchronously` infos elsewhere).

## Remaining risks / follow-ups
- **Android hardware back** on a `go`-entered root screen still triggers go_router's default (the OS
  backgrounds the app when there's nothing to pop). The visible **Home/back** control is the intended
  exit; if we later want hardware-back to route Home instead of backgrounding, wrap those specific
  screens in `PopScope(canPop: Navigator.canPop(context), onPopInvokedWithResult: → go('/'))`. Left
  out for now to avoid version-sensitive back-handling regressions.
- The browsing screens (category/search/promotions/reviews/content) are push-only today, so they
  already work; they can adopt `AdaptiveLeading` later for pure uniformity if a future flow ever
  `go`s into them.
- `payment_pending_screen` is effectively dormant under COD-only checkout, but was fixed anyway.

## How to resume
The pattern is `AdaptiveLeading` in `core/widgets/`. To make any new full-screen (root-navigator)
route trap-proof, add `leading: const AdaptiveLeading()` (optionally a `fallbackLocation`) to its
`AppBar`. Do NOT add it to shell-tab screens (they have the bottom bar). Keep the two apps' copies
of the widget in sync.
