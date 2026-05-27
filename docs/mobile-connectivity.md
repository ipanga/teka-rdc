# Mobile connectivity management

Authoritative reference for the connectivity layer in `buyer-mobile` + `seller-mobile`. Shipped 2026-05-27 in PRs #243 → #254 (7 PRs).

The two Flutter apps run on Android phones in DRC. Most users are on 2G/3G with frequent drops, captive portals at cafés, or shared cell-towers that flake under load. Letting Dio time out a request after 30s is a bad UX — by then the user has tapped "Pay" three times and rage-quit. This layer makes the apps **aware** of network state, **retry intelligently** where safe, **fail fast** where not, and **surface state visibly** to the user.

The same code lives at `apps/buyer-mobile/lib/core/connectivity/` + `apps/buyer-mobile/lib/core/network/` and is mirrored byte-for-byte at `apps/seller-mobile/lib/core/…`. Changes ship in lockstep — see Rule 15 in CLAUDE.md.

## State machine

Five states, one snapshot at a time:

```
            interface up                interface down
       ┌──────────────────────┐     ┌──────────────────────┐
       │                      ▼     ▼                      │
 reconnecting ─── probe ok ─▶ connected ◀── probe ok ─── unstable
       ▲                      │  ▲ │                      ▲
       │                      │  │ │                      │
       │            probe slow│  │ │probe slow             │
       │            (>1500ms) │  │ │(>1500ms, x2)         │
       │            x1 fast   │  │ │                      │
       │                      │  │ ▼                      │
       │                      │  noInternet ──────────────┘
       │                      │     ▲
       │  interface down      │     │ probe fail
       │      ▼               │     │ (timeout / DNS / 5xx)
       └── disconnected ◀─────┘─────┘
```

| State | Meaning | UI banner |
|---|---|---|
| `connected` | Interface up + probe `< 1500ms` | (none) |
| `unstable` | Interface up + probe slow (≥2 consecutive `≥1500ms`) | orange "Connexion lente" |
| `noInternet` | Interface up but probe fails (captive portal, DNS, 5xx) | orange "Pas d'accès internet" |
| `disconnected` | Interface reports down (`ConnectivityResult.none`) | red "Hors-ligne" |
| `reconnecting` | Recovery in progress — interface flipped back up, probe pending | (none — transient) |

Hysteresis is asymmetric on purpose: **two slow probes** push the user into `unstable`, but **one fast probe** brings them out. DRC 3G flaps too often to symmetric-debounce.

## Sources of truth

| Source | What it tells us | How it's used |
|---|---|---|
| `connectivity_plus` (`Connectivity().onConnectivityChanged`) | Interface up/down (wifi/cellular/none) | Drives the `disconnected` ↔ rest transitions. Triggers an immediate probe on flip. |
| Probe — `GET ${baseUrl}/v1/health` (3s timeout) | Actual reachability + latency | Drives the `connected` / `unstable` / `noInternet` transitions. |

The probe is the deliberate centerpiece — interface state alone is a lie in DRC (a wifi connection at a café often has zero internet access). We added no third-party reachability package; `Dio` already exists, and `/v1/health` is `@Public` + `@SkipThrottle`.

**Probe cadence:**
- Healthy states (`connected` / `unstable`): every 30s.
- `noInternet`: every 5s (we want recovery latency low).
- `disconnected`: probes pause entirely (interface is down — no point burning battery).

## Retry policy

Implemented at `apps/buyer-mobile/lib/core/network/retry_interceptor.dart`. Full-jitter exponential backoff — the AWS pattern — so devices coming back online after a shared outage don't thunder-herd the API.

| Property | Value |
|---|---|
| Retry-safe methods | `GET`, `HEAD` |
| Opt-in for non-safe | `Options(extra: {'retryable': true})` — **never** apply to checkout, OTP, payments, order state transitions |
| Retried errors | `connectionTimeout`, `receiveTimeout`, `sendTimeout`, `connectionError`, HTTP `502/503/504` |
| **Not** retried | Any other 4xx/5xx, `badCertificate`, `cancel`, `unknown` |
| Backoff schedule | `[0..500ms, 0..1500ms, 0..4000ms]` per attempt (full jitter) |
| Cap per attempt | 5s |
| Max attempts | 3 |

The retry counter rides on `RequestOptions.extra['_retryAttempt']` so the interceptor chain re-enters itself cleanly. The interceptor is constructed with `client: dio` so retries flow through the **full chain** (auth attach, log, offline-aware) — bypassing them would skip token refresh.

## Offline-aware policy

Implemented at `apps/buyer-mobile/lib/core/network/offline_aware_interceptor.dart`. Pre-flights every request against the current state.

| State | `GET`/`HEAD` | `POST`/`PUT`/`PATCH`/`DELETE` |
|---|---|---|
| `connected` / `unstable` / `reconnecting` | ✅ | ✅ |
| `noInternet` | ✅ (retry interceptor will deal with it) | ✅ |
| `disconnected` | ✅ (rare — useful for stale-while-reconnecting reads) | ❌ — synthesizes `DioException(type: connectionError, error: 'offline')` instantly |

Opt-out per request: `Options(extra: {'allowOffline': true})` — used for the cart hydration path that wants to fail silently when offline.

## Auth-refresh resilience

`AuthInterceptor` (`apps/buyer-mobile/lib/core/network/auth_interceptor.dart`) distinguishes connectivity-caused refresh failures from real auth failures. If `POST /v1/auth/refresh` fails with `connectionTimeout` / `receiveTimeout` / `sendTimeout` / `connectionError` / `502` / `503` / `504`, **tokens are preserved**. The 401 surfaces to the caller and the caller retries when connectivity returns. Without this, a buyer on a bus would log out every time their LTE blinked.

A real 401 from the refresh endpoint still wipes tokens and force-logs-out, as before.

## Offline behavior matrix

| Feature | Offline behavior | Why |
|---|---|---|
| Cart | Hydrates from `SharedPreferences` synchronously; subsequent server reads update silently when back online | Buyers add items on the bus; cart must survive |
| Checkout (review step) | Place-order button **disabled** + permanent banner "Connexion requise pour passer commande" | Hard-block (locked decision 2026-05-27). No queue-and-replay. |
| OTP request/verify, login, password reset | Standard error surfaces ("Pas de connexion internet") | These are auth, can't be queued |
| Product browse, categories, profile | Returns last cached value if available, else error | Cache wiring is opt-in; only the cart is wired today (see [Deferred work](#deferred-work)) |
| Order creation, seller order transitions, payouts, product publish | Hard-blocked by `OfflineAwareInterceptor` when disconnected | Non-retry-safe — state mutations must not race the wire |

## UI

A slim 5-state banner sits above every route, mounted by `MaterialApp.router.builder` → `ConnectivityBannerHost`. Colors and copy:

| State | Color | Copy (FR) | Localization key |
|---|---|---|---|
| `disconnected` | Red | "Hors-ligne. Vérifiez votre connexion." | `connectivityBannerDisconnected` |
| `noInternet` | Orange | "Pas d'accès internet. Tentative de reconnexion…" | `connectivityBannerNoInternet` |
| `unstable` | Orange | "Connexion lente." | `connectivityBannerUnstable` |
| `reconnecting` | Orange | "Reconnexion en cours…" | `connectivityBannerReconnecting` |
| `connected` (after offline) | Green, **3s only** | "Connexion rétablie" | `connectivityBannerRestored` |

The "Connexion rétablie" toast is gated on `_previousOfflineStatus` only tracking `disconnected` + `noInternet` — `reconnecting → connected` on app startup must not flash a green banner.

Animations: `AnimatedSize` 200ms (height) + `AnimatedSwitcher` 200ms (cross-fade).

## App lifecycle

`ConnectivityLifecycleObserver` (a `WidgetsBindingObserver`) wraps `ConnectivityBannerHost` and bridges:

| `AppLifecycleState` | Action |
|---|---|
| `paused` / `inactive` / `hidden` | `service.pause()` — stops the probe timer to save battery |
| `resumed` | `service.resume()` — fires an immediate probe; restarts the timer |

We deliberately do **not** invalidate the auth provider on resume — `AuthInterceptor`'s connectivity-aware refresh already handles "tokens still valid, just couldn't reach the server."

## Observability (Sentry)

Three signals, all gated by `SENTRY_DSN` being set (no-op when empty).

| Signal | When it fires | Rate limit |
|---|---|---|
| `connectivity_state` tag on every event | Set on every state transition; subsequent Sentry events anywhere in the app inherit it | n/a |
| Breadcrumb category `connectivity` | Every state transition | Sentry's 100-buffer default |
| `connected_to_noInternet` event | Real degradation (clean drop ≠ this) | 1/min |
| `sustained_noInternet` event | ≥5 consecutive `noInternet` snapshots | 1/min |
| `retry_budget_exhausted` event | Retry interceptor used all 3 attempts on a GET | 1/min |

**Privacy:** captured fields are connectivity status, latency (ms), short error tag (`timeout` / `dns` / `http_5xx`), HTTP method, URL path. **No query strings, no request bodies, no auth tokens, no phone numbers.** The pre-existing phone-number `beforeSend` scrubber at `core/config/sentry_scrub.dart` is unaffected.

## Adding a new feature — checklist

When you add a new network-touching feature in either Flutter app:

1. **Default to no extra config.** A plain `dio.get('/v1/foo')` automatically gets retry + offline-aware + auth + log behavior.
2. **For a non-safe call that's truly idempotent** (rare — e.g. an idempotency-keyed POST), opt in with `Options(extra: {'retryable': true})`.
3. **For a call that should run even when offline** (e.g. reading a cache key via a method that internally probes), opt out with `Options(extra: {'allowOffline': true})`.
4. **For state mutations**, do nothing — `OfflineAwareInterceptor` hard-blocks them when disconnected. Surface the resulting `DioException` to the user with the shared helper at `apps/buyer-mobile/lib/core/network/dio_error_messages.dart` (returns the right French string for each `DioExceptionType`).
5. **For background work that depends on a token** (push registration, profile sync), trust `AuthInterceptor` — it won't log the user out on a transient timeout.
6. **For caching**, follow the `TypedCache` pattern at `apps/buyer-mobile/lib/core/cache/typed_cache.dart`: write-through on success, hydrate synchronously on read, treat the entry as stale-but-usable until the next successful fetch.

## Files

```
apps/buyer-mobile/lib/core/connectivity/
├── connectivity_status.dart                 enum + ConnectivitySnapshot
├── connectivity_service.dart                state machine + probe loop
├── connectivity_provider.dart               Riverpod providers
├── connectivity_lifecycle_observer.dart     WidgetsBindingObserver bridge
├── connectivity_sentry_reporter.dart        observability
└── widgets/
    └── connectivity_banner.dart             global banner widget

apps/buyer-mobile/lib/core/network/
├── api_client.dart                          chain: OfflineAware → Auth → Retry → Log
├── offline_aware_interceptor.dart           fail-fast for non-safe calls when disconnected
├── retry_interceptor.dart                   full-jitter exponential backoff
├── auth_interceptor.dart                    connectivity-aware refresh
├── log_interceptor.dart                     dev-mode logging
└── dio_error_messages.dart                  French error-string helper (shared across providers)

apps/buyer-mobile/lib/core/cache/
├── typed_cache.dart                         SharedPreferences-backed cache
└── cache_keys.dart                          reserved key constants
```

The same tree exists at `apps/seller-mobile/lib/core/`.

## Deferred work

Cache wiring is currently live only on the cart. The plan reserved cache keys for `productsList`, `categoriesTree`, `userProfile`, `sellerOrdersList`; wiring those in is the next opt-in pass. Offline cart **mutation** queueing (add-while-offline-replay-on-reconnect) was also deferred — the current behavior is hard-block via `OfflineAwareInterceptor`.

## Tests

Total: 54 specs (buyer-mobile), mirrored in seller-mobile.

| Layer | File | Coverage |
|---|---|---|
| State machine | `test/core/connectivity/connectivity_service_test.dart` | 10 |
| Retry | `test/core/network/retry_interceptor_test.dart` | 9 |
| Offline-aware | `test/core/network/offline_aware_interceptor_test.dart` | 10 |
| Banner | `test/core/connectivity/connectivity_banner_test.dart` | 8 |
| Lifecycle | `test/core/connectivity/connectivity_lifecycle_observer_test.dart` | 8 |
| Typed cache | `test/core/cache/typed_cache_test.dart` | 9 |

## Why these decisions

| Decision | Why |
|---|---|
| Probe `/v1/health` instead of `internet_connection_checker_plus` | One fewer dep, no extra HTTPS handshake setup, lines up exactly with what the API considers "alive" |
| Cart persisted to SharedPreferences | Buyers add items on the bus; losing the cart on app kill was the #1 complaint |
| Hard-block offline checkout (no queue-and-replay) | Replay would race against price + stock changes during the offline window; surface the offline state and let the user retry |
| Full-jitter backoff | DRC shared cell-tower outages knock thousands offline simultaneously — predictable exponential delays would reconnect them in lockstep and DDoS the API |
| Email-fallback on Sentry rate limits (no fallback) | Sentry's own rate limit handles spam at the project level; the in-code 1/min ceiling is for *meaningfully different* events not retried-but-succeeded chatter |
