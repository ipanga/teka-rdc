# Mobile: connectivity UX · product-detail cleanup · rating/identifier fixes

**Started:** 2026-07-26 · **Branch:** `fix/mobile-connectivity-toast` (base `develop`) ·
**Status:** all six PRs code-complete; device verification outstanding

Tracker for nine device-reported defects across buyer-mobile (one shared with seller-mobile). Read
this file first when resuming; each PR section below is self-contained.

## Reported symptoms → root causes

The nine reported symptoms collapse into **five** independent root causes. Symptoms 6–9 are all the
same bug.

| # | Symptom (as reported) | Root cause | PR |
|---|---|---|---|
| 1 | Intrusive full-width connectivity bar pushes the page down (both apps) | `ConnectivityBannerHost` renders a `Column[banner, Expanded(child)]` mounted in `MaterialApp.router.builder` — structurally above every route. On a flapping link the 3s green bar re-fired every ~5s, reflowing the page each time. | PR1 |
| 2 | "5 vendus" on public product cards | `unitsSold` rendered in `product_card.dart` (one widget, 9 surfaces) + PDP + the two buyer-web equivalents. | PR2 |
| 3 | Share button does nothing | Handler exists but has three unguarded silent-failure paths (null URL → bare `return`, no `try/catch`, no `sharePositionOrigin`). | PR3 |
| 4 | Support-contact block on PDP | Static block in the PDP seller card. | PR3 |
| 5 | Caractéristiques show values without labels | API returns `specifications[].attribute.name` (nested); every client reads a flat `spec.name` that does not exist. Affects buyer-mobile, buyer-web **and** admin-web. | PR4 |
| 6 | Rating screen shows "Validation failed (uuid is expected)" | ↓ | PR5 |
| 7 | PDP behaves differently from Order Detail | ↓ | PR5 |
| 8 | Favorite fails from Order Detail | ↓ | PR5 |
| 9 | Rating section missing from Order Detail | **One bug:** Order Detail navigates by `shortCode` (`OrderItemModel.productLinkId`), the PDP forwards that *route param* to API-bound children, and `/v1/reviews/*` + `/v1/wishlist/*` are `ParseUUIDPipe`. The pipe's English message is a plain string, so `HttpExceptionFilter` passes it through and `extractDioErrorMessage` treats it as a French business message. The reviews section then collapses to `SizedBox.shrink()` when stats are null. | PR5 |

buyer-web already fixed #6–#9 for itself (see the comment in `product-detail-page.tsx` and commit
`29882b6`); buyer-mobile never got the parity fix.

## Decisions

- **Sold count:** removed from public cards **and** PDP. `unitsSold` stays in the API — it is the
  popularity sort key (`browse.service.ts`) and is incremented on delivery.
- **Offline UX:** transient toast only. No persistent global offline affordance — sustained offline
  is surfaced by the screen that needs it (checkout's inline notice, `AppErrorState`).
- **UUID fix:** clients pass the resolved UUID + French error mapping. **No API contract widening** —
  `/v1/reviews/*` and `/v1/wishlist/*` keep accepting UUIDs only.

---

## PR1 — Connectivity toast · buyer-mobile + seller-mobile ✅ code complete

Branch `fix/mobile-connectivity-toast`.

**Files**

| File | Change |
|---|---|
| `lib/core/connectivity/widgets/connectivity_banner.dart` | deleted (both apps) |
| `lib/core/connectivity/widgets/connectivity_toast_host.dart` | new — `ConnectivityToastHost` (both apps, byte-identical) |
| `lib/core/widgets/app_snackbar.dart` | new — `showAppSnackbar` + `AppSnackbarTone` (both apps, byte-identical) |
| `lib/app.dart` | mount `ConnectivityToastHost` instead of the banner (both apps) |
| `lib/core/connectivity/connectivity_lifecycle_observer.dart` | doc comment only |
| `test/core/connectivity/widgets/connectivity_banner_test.dart` | deleted (8 specs) |
| `test/core/connectivity/widgets/connectivity_toast_host_test.dart` | new — 13 specs, mirrored into seller (seller's first connectivity test) |

**Design**

- Mounted exactly where the banner was. `MaterialApp` wraps `builder:` *inside* its
  `ScaffoldMessenger`, so the host shares the messenger every routed `Scaffold` resolves to — no
  `scaffoldMessengerKey`. `SnackBarBehavior.floating` presents to the *root* scaffold (the shell that
  owns the bottom nav) and offsets above it and above the gesture inset automatically.
- `build() => widget.child` — zero layout contribution, which the load-bearing test asserts by
  comparing page rects before/after a transition.
- Five states → three buckets: `disconnected`/`noInternet` → offline toast; `connected` → "rétablie"
  but only to close a loop actually opened; `unstable`/`reconnecting` → nothing.
- Anti-flap: dedupe on the **bucket** (a fresh snapshot lands every ~30s because
  `ConnectivitySnapshot ==` includes `at`), 2s `settleDelay`, and a 60s cooldown (2× the healthy
  probe interval). A 35s-period flap yields ~1 toast per 80s instead of six page reflows.
- Cold-start invariant preserved and now double-guarded: `reconnecting → connected` at boot never
  shows "Connexion rétablie".
- Cooldown uses a `Timer`, not `DateTime.now()`, so it is deterministic under the test clock.

**Not touched (deliberate):** `connectivity_service.dart`, `connectivity_provider.dart`,
`connectivity_status.dart`, `connectivity_sentry_reporter.dart`, all of `core/network/`, and
`features/checkout/`. Folding `reconnecting` into `isOfflineProvider` would flicker checkout's
place-order button disabled on every recovery probe — the checkout inline notice is unchanged.

**Rejected:** an infinite-duration "offline" snackbar. `showSnackBar` queues, so it would starve
every other snackbar for the whole offline window.

**Tests:** buyer `flutter test` 145 passed; seller 26 passed (was 12 — +13 mirrored specs +1).
`flutter analyze --no-fatal-infos` clean for `lib/` and `test/` in both apps (remaining items are
pre-existing infos; the errors reported under `build/ios/SourcePackages/**` are vendored Firebase
sample code, absent on a clean CI checkout). `diff -r` over `lib/core/connectivity` between the two
apps: identical.

**Not verified:** on-device behaviour (no device attached). Outstanding device checks are listed at
the bottom of this file.

---

## PR2 — Remove public sold count · buyer-mobile + buyer-web ✅ code complete

`product_card.dart` (one widget, all nine card surfaces) + the PDP price block;
mirrored on web in `product-card.tsx` + `product-detail-page.tsx`. On the mobile
card the count shared a Row with the rating, so the else-branch that rendered it
standalone for unreviewed products is gone entirely.

`unitsSold` deliberately stays in the payload, the Prisma model and the client
types — `browse.service.ts` uses it as the popularity sort key and
`admin-orders.service.ts` increments it on delivery. The type comments that
described it as public copy were updated so it does not get re-added.

Tests: buyer-mobile 145, buyer-web type-check clean.

## PR3 — PDP share + support block · buyer-mobile + buyer-web ✅ code complete

The share handler existed and `share_plus ^10.1.4` was installed, so this was
never a missing callback. It had three silent-failure paths, any of which looks
exactly like a dead button: a null URL hitting a bare `return`, an uncaught
`StateError` from `FlavorConfig.instance` inside `productWebUrl`, and
`Share.share` throwing on iPad/macOS without a `sharePositionOrigin`. All three
now report to Sentry (`action=product_share` + product id) and show a French
snackbar; the popover is anchored via a `GlobalKey`; the button is disabled
rather than inert while the product loads.

`productWebUrl` itself was correct and is unchanged — it already mirrors
buyer-web's `productHref` and `WEB_BASE_URL` is set in all three flavor files.

**Which path fires on the reporter's device is still unknown** and needs an
on-device repro; the change makes it name itself instead of failing silently.

Support block removed from the mobile PDP and the equivalent link from
buyer-web's seller card. Support access unchanged in Compte → Aide, the footer,
`/contact` and order support.

## PR4 — Characteristic labels · api + buyer-web + admin-web + buyer-mobile ✅ code complete

Fixed at the source: `getProductDetail` now flattens specifications to
`{ id, attributeId, name, value, sortOrder }` and delegates ordering to Prisma
(`orderBy: { attribute: { sortOrder: 'asc' } }`), so the admin-configured order
is preserved; empty rows are dropped server-side. The same flattening was
applied to `admin-products.service.findProductForReview` — admin-web reads
`spec.name` too, so it had the identical bug.

Clients need no change to benefit. Defensive extras: the Dart `fromJson` falls
back to `attribute.name` (so a mobile build on an older API degrades to today's
behaviour instead of breaking), and both PDPs filter half-empty specs before
deciding whether to render the section.

Tests: API 229 (+3 covering flattening, ordering and the empty-row drop).

## PR5 — Canonical product identifier · buyer-mobile + api ✅ code complete

The four-symptom bug. `ProductDetailScreen.productId` → `identifier`
(uuid | shortCode | slug); `product.id` is now the only value handed to
`WishlistButton`, `_ReviewsSection`, `_RelatedSection`,
`RecentlyViewedSection` and the `/products/:id/reviews` push. Order Detail gains
`productReviewId` (always the uuid) for the rating CTA while `productLinkId`
stays display-only; both are documented as such at the definition.

The Avis section no longer collapses to `SizedBox.shrink()` on failure — it
shows a compact retryable notice, because "missing" is indistinguishable from
"no reviews yet". `ReviewsNotifier._init` loads its four calls independently and
only reports an error when the core data fails, so a guest's 401 on `canReview`
no longer blanks the section.

Backstops: `UuidParam` (French `Identifiant invalide.`) replaces the raw
`ParseUUIDPipe` on the 8 buyer-facing reviews/wishlist params, and
`extractDioErrorMessage` stops passing Nest's built-in English pipe messages
through as if they were our French copy (mirrored into seller-mobile). **No API
contract change** — the endpoints still accept uuids only.

Side effect worth knowing: recently-viewed exclusion now works from every entry
point, since it also compares uuids.

Tests: API 229 unit + 118 e2e (+2 asserting the shortCode rejection is French),
buyer-mobile 156 (+11), seller-mobile 31 (+5 mirrored). Verified zero diff under
`features/checkout/` and `connectivity_provider.dart`.

## PR6 — Docs ✅ code complete

`docs/mobile-connectivity.md` § UI fully rewritten (the old copy table listed
strings that never shipped and `connectivityBanner*` localization keys that
never existed — neither app has an l10n layer). State table, files tree, tests
table (the "mirrored in seller-mobile" claim was false and is now per-row),
deferred work and the decisions table all updated. CLAUDE.md Rule 15 gains two
bullets: use `showAppSnackbar`, and use `UuidParam` on buyer-facing params
because the mobile helper renders API 4xx messages verbatim.

---

## Outstanding device verification (cannot be claimed from this environment)

No physical device is attached and the cloud DB is unreachable from the build env, so none of the
below has been executed:

- Real OS share sheet contents + iPad popover anchoring (PR3).
- Real 2G/3G flapping behaviour and toast cadence on a live network (PR1).
- App Links opened from WhatsApp (PR3/PR5).
- End-to-end rating submission against a live API (PR5).

## Test summary (this branch vs `develop`)

| Suite | Before | After |
|---|---|---|
| API unit | 226 | 229 |
| API e2e | 116 | 118 |
| buyer-mobile | 139 | 156 |
| seller-mobile | 12 | 31 |
| buyer-web / admin-web | type-check clean | type-check clean |

## Risks and rollback

- **PR1** is the highest-visibility change (every screen in both apps). It is
  self-contained: reverting the commit restores the banner, since the state
  machine and providers were never touched.
- **PR4** changes a response shape (`specifications[]` is flattened). It is
  additive for readers of `name`/`value` and no client read `attribute.name`, but
  any *unknown* consumer reading the nested shape would break. seller-web only
  writes specs, so it is unaffected.
- **PR5** renames a widget parameter and changes which id reaches four call
  sites; the API contract is unchanged, so client and server can deploy in
  either order.
- No DB migration, no env var, no deployment ordering constraint in this branch.

## Resume instructions

1. Read this file, then `STATUS.md`.
2. `git log --oneline develop..HEAD` — six commits, one per PR, in the order
   above (PRs 2, 3 and 5 all touch `product_detail_screen.dart`, hence the
   stacking).
3. Remaining work is the device pass listed above, then opening the PRs into
   `develop` (never `main`).
