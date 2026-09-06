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

### How the surface is resolved (D2a, 2026-09-06)

All three cookie namespaces share `Domain=.teka.cd`, so a browser signed in on several surfaces sends
**all** of their cookies to `api.teka.cd` on every request. Which one authenticates a request is a
security decision made from two trusted inputs only (`apps/api/src/auth/surface.util.ts`):

1. **The request `Origin`**, matched exactly (`URL.origin`, no prefix/suffix/substring) against the
   configured web URLs — `ADMIN_WEB_URL` → `admin`, `SELLER_WEB_URL` → `seller`, `BUYER_WEB_URL` and every
   remaining `CORS_ORIGINS` entry (the `www.` twin, the dev ports) → `buyer`. It selects the **only**
   cookie namespace the `JwtStrategy` may read. No `Origin`, or an `Origin` that is not one of the web
   apps (`https://teka.cd.attacker.example`, `https://admin.teka.cd.attacker.example`, a wrong scheme or
   port, `null`), means **no cookie is read at all** — the request can still carry a bearer token.
2. **The account's stored role** fixes the namespace a session is written to
   (`surfaceForRole`: BUYER → buyer, SELLER → seller, ADMIN/SUPPORT/FINANCE → admin). Cookies are set
   and cleared for that surface on login / OTP verify / refresh / logout / `/me` / account deletion —
   never for a client claim — and a token read from namespace X whose stored role belongs to namespace Y
   is refused with 401 « Session invalide pour cette interface ». The role is re-read from the database
   on every request, so a forged role claim inside a token changes nothing either.

`X-Teka-Surface` is still sent by every web api-client (and stays CORS allow-listed so preflights keep
passing) but is **telemetry only**: the strategy logs a warning when it disagrees with the origin surface
and otherwise ignores it. It can never grant, widen or switch a session. Mobile apps send neither cookies
nor the header: the bearer path is unchanged and needs no `Origin`.

CORS (`CORS_ORIGINS`, credentials) only decides which browser origins may read responses; it is not an
authorization mechanism.

Cookie attributes since D2a: admin and seller cookies are `SameSite=Strict` (`api.teka.cd` is same-site
with `admin.teka.cd` / `seller.teka.cd`, and nothing legitimately navigates into those apps cross-site);
the public buyer site keeps `Lax` so a session survives an inbound WhatsApp / search link. The shared
`.teka.cd` domain itself is the D2b topic (dedicated admin API boundary).

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

- No CSRF token mechanism. Cross-site: `SameSite` (Strict on admin/seller, Lax on buyer). Same-site (another
  `*.teka.cd` origin): since D2a a cookie can only authenticate a request whose `Origin` is that cookie's
  own web app, which closes the cross-surface case that `SameSite` cannot see.
- Refresh tokens are per-session but not per-app-origin scoped on `/refresh`
  (the surface header + cookie name already isolate them in practice).
