# Mobile: connectivity UX · product-detail cleanup · rating/identifier fixes

**Started:** 2026-07-26 · **Branch base:** `develop` · **Status:** in progress

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

## PR2 — Remove public sold count · buyer-mobile + buyer-web ⬜ pending

## PR3 — PDP share + support block · buyer-mobile + buyer-web ⬜ pending

## PR4 — Characteristic labels · api + buyer-web + admin-web + buyer-mobile ⬜ pending

## PR5 — Canonical product identifier · buyer-mobile + api ⬜ pending

## PR6 — Docs ⬜ pending

---

## Outstanding device verification (cannot be claimed from this environment)

No physical device is attached and the cloud DB is unreachable from the build env, so none of the
below has been executed:

- Real OS share sheet contents + iPad popover anchoring (PR3).
- Real 2G/3G flapping behaviour and toast cadence on a live network (PR1).
- App Links opened from WhatsApp (PR3/PR5).
- End-to-end rating submission against a live API (PR5).

## Resume instructions

1. Read this file, then `STATUS.md`.
2. `git log --oneline develop..HEAD` to see which PRs have landed.
3. Continue with the first section marked ⬜, in order — PRs 2, 3 and 5 all touch
   `product_detail_screen.dart` and must stack in that order.
