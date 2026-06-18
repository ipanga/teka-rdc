# Session management & auth cookies

Authoritative reference for how web sessions, cookies, and token rotation work
across the three Teka web surfaces and the API. Mobile uses bearer tokens (dio)
and is **not** affected by anything cookie-related here.

## Surfaces & cookie namespaces (since 2026-06-18)

The API runs on `api.teka.cd`; the three web apps on `teka.cd`,
`seller.teka.cd`, `admin.teka.cd`. Cookies are set with `domain=.teka.cd` so
the browser sends them to `api.teka.cd` (without this, the cookie is scoped to
the web origin and the API never receives it).

Because the domain is shared, **cookie names** are what isolate the three
sessions. Each surface has its own namespace:

| Surface | Access cookie | Refresh cookie | Session hint |
|---|---|---|---|
| buyer (`teka.cd`) | `teka_buyer_access_token` | `teka_buyer_refresh_token` | `teka_buyer_session` |
| seller (`seller.teka.cd`) | `teka_seller_access_token` | `teka_seller_refresh_token` | `teka_seller_session` |
| admin (`admin.teka.cd`) | `teka_admin_access_token` | `teka_admin_refresh_token` | `teka_admin_session` |

Cookie attributes: `httpOnly` (access+refresh), `secure` in prod, `sameSite=lax`,
`path=/`, `domain=.teka.cd`. The `*_session` hint is **non-HttpOnly** (JS reads
it to decide whether a refresh is worth attempting). Access TTL 15 min, refresh
+ hint TTL 7 days.

**Isolation guarantees:** logging in / out or expiring on one surface does not
touch the others. A logged-in buyer who visits `seller.teka.cd` is treated as a
guest (seller-web only reads `teka_seller_*`), so the dashboard role-gate is now
pure defense-in-depth rather than load-bearing.

### How the surface is resolved

Each web api-client sends an **`X-Teka-Surface: {admin|seller|buyer}`** header on
every request (`apps/{app}-web/src/lib/api-client.ts`, the `SURFACE` constant).
The API resolves it via `apps/api/src/auth/surface.util.ts` (`resolveSurface`)
to pick which cookie set to read/write/clear:

- JWT cookie extractor (`auth/strategies/jwt.strategy.ts`) reads
  `teka_{surface}_access_token`; the `Authorization: Bearer` fallback (mobile)
  is unchanged.
- `setAuthCookies` / `clearAuthCookies` / `refreshSessionHint` / `/refresh`
  (`auth/auth.controller.ts`) all operate on the resolved surface.
- `X-Teka-Surface` is allow-listed in CORS (`main.ts`). A request with no
  surface header falls back to `buyer` (harmless — only matters for cookie
  requests, and the web apps always send it).

Raw `fetch` calls that rely on cookie auth (e.g. the admin CSV blob download)
must send `X-Teka-Surface` themselves — everything else goes through `apiFetch`,
which adds it. `apiFetch` is FormData-aware (it omits `Content-Type` for
multipart so uploads keep auto-refresh).

## Refresh-token rotation & the grace window

Refresh tokens **rotate on every refresh**: `refreshTokens()` revokes the used
token and issues a new one (`RefreshToken` row per session, `revokedAt`
stamped). Reuse of an already-revoked token is normally treated as a stolen-
token **replay** → `revokeAllUserTokens()` (every session killed).

The problem that caused "seller logged out after creating a product": with a
15-min access token, rotate-on-refresh, and a shared `.teka.cd` cookie across
tabs, two near-simultaneous refreshes (or a retried request) can replay a token
that was legitimately rotated **milliseconds** ago — tripping revoke-all.

**Grace window** (`AuthService.ROTATION_GRACE_MS = 15s`): a revoked token
presented within the window (and whose hash matches, and whose JWT is unexpired)
is a **benign race** → re-issue a fresh session without revoke-all. Beyond the
window, a revoked token is genuine reuse → revoke-all stands. Uses the existing
`revokedAt` column — no schema change.

Observability (Sentry + logs, no tokens/PII): `auth.refresh.rotation_race`
(info), `auth.refresh.replay_detected` (warning), and scoped/full logout debug
lines.

## Logout scoping

`POST /v1/auth/logout` passes the current session's `jti` (from the access
token) to `logout(userId, jti)`, revoking **only** that session's refresh token
and clearing only that surface's cookies. Logging out of one surface no longer
revokes the user's other sessions. A full revoke-all still happens on password
change.

## Client behaviour

`fetchUser()` (the auth stores) only nulls the user on a genuine **401** (after
the api-client's own refresh attempt). A transient network error or 5xx leaves
the session intact — a momentary hiccup must not log the user out.

## Deploy note

Renaming the cookies forces a **one-time re-login** for all currently-active web
users (the old `teka_access_token` is no longer read). Deploy at low traffic.

## Not done (possible follow-ups)

- No CSRF token mechanism — protection is `sameSite=lax` only.
- Refresh tokens are per-session but not per-app-origin scoped on `/refresh`
  (the surface header + cookie name already isolate them in practice).
