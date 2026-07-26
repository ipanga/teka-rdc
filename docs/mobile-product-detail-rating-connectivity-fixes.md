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

## Consolidated physical-device checklist (iOS + Android)

One pass covering all six PRs. Run against a build of the **full stack** (all six merged, or the
tip of `docs/mobile-fixes-tracker`) pointed at an API running PR4+PR5.

Build: `flutter run --flavor development --dart-define-from-file=flavors/development.json`
(use `staging`/`production` if testing against a deployed API).

**Devices:** at least one physical Android (the 2GB/Android 8 target class if available) and one
physical iPhone. The iPad column matters only for the share popover. Simulators/emulators are
**not** sufficient for the share sheet, real network flapping, or App/Universal Links.

Preconditions: a buyer account with **≥1 DELIVERED order** containing a product that is still
ACTIVE, at least one product carrying attributes (Taille/Matière/Couleur), and one product with
recorded sales.

### A. Connectivity (PR1) — buyer-mobile **and** seller-mobile

| # | Step | Expected | iOS | Android |
|---|---|---|---|---|
| A1 | Cold start, network on | **No toast at all** (cold-start invariant) | ☐ | ☐ |
| A2 | Cold start in airplane mode | Offline toast; note the AppBar's vertical position | ☐ | ☐ |
| A3 | Compare A1 vs A2 screenshots | AppBar/page position **identical** — nothing shifted | ☐ | ☐ |
| A4 | Airplane on → wait 5s → off | Offline toast, then "Connexion rétablie." (if ≥60s since last toast) | ☐ | ☐ |
| A5 | **Flap:** toggle airplane 4× within 60s | ≤ ~1 toast/min; page never reflows | ☐ | ☐ |
| A6 | Scroll mid-feed, then drop connection | Scroll position preserved | ☐ | ☐ |
| A7 | Toast while on a tab route | Floats **above** the bottom nav, not behind it | ☐ | ☐ |
| A8 | Toast on PDP and on checkout | Clears those screens' bottom bars too | ☐ | ☐ |
| A9 | Background 30s while offline → resume | No stale/burst toasts | ☐ | ☐ |
| A10 | Walk to weak signal (real 2G/3G, not airplane) | Slow-but-alive shows **nothing** (`unstable` is silent) | ☐ | ☐ |
| A11 | **Checkout regression:** go offline on the review step | Inline "Connexion requise pour passer commande" + disabled button, exactly as before | ☐ | ☐ |
| A12 | Repeat A1–A9 in **seller-mobile** | Identical behaviour | ☐ | ☐ |

### B. Product cards + detail (PR2, PR4)

| # | Step | Expected | iOS | Android |
|---|---|---|---|---|
| B1 | Home: Promotions / Populaires / Nouveautés | **No "X vendus"** on any card | ☐ | ☐ |
| B2 | Search, Category, Favoris, Recently viewed, Related rail | No "X vendus" | ☐ | ☐ |
| B3 | PDP of a product with sales | No sold count under the price; rating row intact and aligned | ☐ | ☐ |
| B4 | PDP of a product with 0 reviews | No leftover gap where the standalone line was | ☐ | ☐ |
| B5 | Category page, default/popularity sort | Best-sellers still rank first (proves `unitsSold` still reaches the API) | ☐ | ☐ |
| B6 | PDP **Caractéristiques** | `Taille : M`, `Matière : Coton`, `Couleur : Bleu` — labels present | ☐ | ☐ |
| B7 | Compare to admin attribute order | Matches configured `sortOrder`, not insertion order | ☐ | ☐ |
| B8 | Product with no attributes | Section absent entirely (no empty card) | ☐ | ☐ |
| B9 | Long label + long value | Wraps, no overflow/ellipsis clipping | ☐ | ☐ |
| B10 | PDP seller card | Support block **gone**; seller name + Officiel/Vérifié badge still render cleanly, no dangling divider | ☐ | ☐ |

### C. Share (PR3)

| # | Step | Expected | iOS | Android |
|---|---|---|---|---|
| C1 | PDP from Home → **Partager** | OS share sheet opens with title + `https://teka.cd/{ville}/{slug}-{code}` | ☐ | ☐ |
| C2 | Share to WhatsApp | Link previews correctly | ☐ | ☐ |
| C3 | Tap that link on a device **with** the app | Opens the app (Universal Links / App Links) on the right PDP | ☐ | ☐ |
| C4 | Tap it on a device **without** the app | Opens the website | ☐ | ☐ |
| C5 | Tap Partager **while the PDP is still loading** | Button visibly disabled; no silent no-op | ☐ | ☐ |
| C6 | Share from a PDP opened via **Order Detail** | Still the canonical URL (not a search URL, not an id) | ☐ | ☐ |
| C7 | **iPad only:** tap Partager | Popover anchors to the button; no crash | ☐ | n/a |
| C8 | If share ever fails | French snackbar + a Sentry event tagged `action=product_share` | ☐ | ☐ |

> C8 is the point of PR3: the trigger was never reproduced, so the first real failure must name
> itself. If C1 fails, **capture the Sentry event** before retrying.

### D. Identifier / favorite / ratings (PR5) — the four-symptom bug

| # | Step | Expected | iOS | Android |
|---|---|---|---|---|
| D1 | Commandes → delivered order → **Noter le produit** | Review form opens. **No "Validation failed (uuid is expected)"** | ☐ | ☐ |
| D2 | Submit rating + comment | French success → back to Order Detail → item shows as reviewed | ☐ | ☐ |
| D3 | Same Order Detail → tap the product row → **heart** | Fills and persists across refresh + reopen | ☐ | ☐ |
| D4 | That PDP → scroll to **Avis** | Section present with stats bar + review list | ☐ | ☐ |
| D5 | Same product opened from **Home** | Identical to D3/D4 | ☐ | ☐ |
| D6 | Open the PDP from Search / Category / Cart / Favoris / push notification / deep link | Heart + Avis work from **every** entry point | ☐ | ☐ |
| D7 | Logged out: open a PDP | Avis still loads (guest 401 on `canReview` must not blank it) | ☐ | ☐ |
| D8 | Logged out: tap the heart | Login prompt → after login, returns to the PDP | ☐ | ☐ |
| D9 | Non-delivered order | No rating CTA | ☐ | ☐ |
| D10 | Already-reviewed item | No CTA / disabled; no duplicate review possible | ☐ | ☐ |
| D11 | Double-tap the rating CTA | One screen, not two | ☐ | ☐ |
| D12 | Airplane mode on the reviews screen | French network message + retry; never raw/English | ☐ | ☐ |
| D13 | Point at an unreachable API, open a PDP | Avis shows "Impossible de charger les avis." + **Réessayer** (not an empty gap) | ☐ | ☐ |
| D14 | Product that became unavailable after purchase | Order Detail row is non-tappable; no rating CTA | ☐ | ☐ |

### E. Cross-cutting

| # | Step | Expected | iOS | Android |
|---|---|---|---|---|
| E1 | Any error surfaced anywhere in the pass | **No English, no raw validation strings**, no stack traces | ☐ | ☐ |
| E2 | Back navigation from every screen touched above | Returns to the correct previous screen | ☐ | ☐ |
| E3 | Low-end Android (2GB) | No jank introduced by the toast; PDP scroll stays smooth | n/a | ☐ |
| E4 | Sentry dashboard after the pass | Only expected events; no flood; **no PII (phones/tokens) in any payload** | ☐ | ☐ |
| E5 | PostHog | `product_shared` / `product_viewed` still fire | ☐ | ☐ |

### Platform-specific gotchas

- **iOS:** Universal Links need the AASA file served from the deployed domain — C3 will fail on a
  dev build pointed at localhost regardless of app correctness. Test C3/C4 against production
  `teka.cd`.
- **Android:** App Links verification requires the release signing cert's fingerprint in
  `assetlinks.json`; a debug build may fall through to the browser. Use
  `adb shell am start -a android.intent.action.VIEW -d "https://teka.cd/..."` to test the intent
  filter directly, independently of verification.
- **iOS share:** the iPad popover (C7) is the only place `sharePositionOrigin` matters; on iPhone
  its absence would not have thrown.
- **Android emulator vs device:** A5/A10 (real flapping) cannot be simulated faithfully — airplane
  mode toggles are a coarse approximation of a degrading cell link.

## Emulator pass, 2026-07-26 (buyer-mobile, Android emulator — **not** the device pass)

Run after all six PRs merged to `develop`, using a **production-flavour debug APK** against the live
`api.teka.cd` (the cloud DB refuses TCP 5432 from the build host, so a local API is not an option).
Android emulator only — no physical device was attached, so nothing here substitutes for the
checklist above.

**Confirmed against the original bug screenshots:**

| Item | Result |
|---|---|
| B1/B2 | Home feed identical to the report; the shirt card's "5 vendus" and Ariel's "2 vendus" are gone, prices/discounts intact |
| B3 | PDP price block has no sold count |
| B6 | `Taille : M`, `Matière : Coton`, `Couleur : Bleu` all render **with labels** |
| B10 | Support block gone; the `Vendeur … ✓ Officiel` row still renders cleanly, no dangling divider |
| A2/A3 | Page is **pixel-identical** online vs airplane mode — AppBar, spec rows and Avis all at the same coordinates |
| A4 (offline leg) | Floating red toast "Connexion Internet indisponible." appears and auto-dismisses |
| A4 (recovery leg) | Green "Connexion rétablie." toast fires after the 60s cooldown has elapsed |
| A7 | On tab routes both toasts sit **above** the bottom navigation bar |

**Correction to an earlier assumption:** B6 was expected to fail until the API deploys, since
`api.teka.cd` still returns the nested `attribute.name` shape. It passes on mobile anyway — PR4's
defensive Dart fallback reads the nested key. That is the back-compat path working as designed.
**buyer-web and admin-web still need the deploy**, as they have no equivalent fallback.

**Finding — A8 not satisfied on pushed routes.** On the PDP the toast **overlays** the bottom CTA bar
rather than clearing it (it covered the disabled "Rupture de stock" button; on an in-stock product it
would briefly cover "Ajouter au panier"). Tab routes clear the nav bar correctly, so this is specific
to routes carrying their own bottom bar. Impact is low — 4s, capped at ~1 toast/min — but the
checklist's A8 wording ("clears those screens' bottom bars too") is not met. Worth a small follow-up:
either accept and reword A8, or give those routes a `bottomNavigationBar`-registered footer so the
framework offsets the snackbar.

**Testing note for whoever repeats this.** The recovery toast is easy to miss: it runs for **2s**
against the offline toast's 4s, and the recovery path is `disconnected → reconnecting → probe →
connected` *then* a 2s settle, so its visible window is roughly **+2s to +4.5s** after the network
returns. Single captures at +4s and +7s both missed it; a burst at 0.7s intervals caught it at
~+2.8s. Also remember the 60s cooldown — toggling airplane mode twice inside a minute correctly
produces **no** second toast, which reads as a failure if you are not expecting it.

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

## Unresolved: one unreproducible API e2e run

On 2026-07-26 a single backgrounded `pnpm test:e2e` run reported **8 failed
tests in 1 suite** (110/118 passing). Every subsequent run passes:

- 3 solo runs — 118/118
- 2 runs executed concurrently with each other — 118/118 each
- 1 run under the same heavy load as the original (workspace `tsc` + both
  `flutter analyze` in parallel) — 118/118

The failure detail was lost (that command's output was filtered to summary
lines only), so the failing suite is unknown. No suite contains exactly 8
tests, which rules out a whole-suite `beforeAll` crash and points at a partial
failure inside one of the four larger suites — `browse` (29), `auth` (26),
`checkout` (11) or `payouts` (9).

**It is not attributed.** Contention was the obvious hypothesis and was
disproved by direct reproduction. Treat it as a possible intermittent flake:
if e2e fails in CI, capture the full output before re-running, and check
whether the same suite is implicated. The only suite this branch touches is
`reviews` (4 tests), which cannot account for 8 failures.

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
