# Status — 2026-05-22

> **What this file is.** A single, hand-edited snapshot of *what is in-flight RIGHT NOW*. Read it first on every resume — before `CLAUDE.md`, before `PROGRESS.md`. When `## Active initiative` gets long, move its contents into `PROGRESS.md` history and reset this file.
>
> **Update rule.** Touch this file in the same commit that starts or ends an initiative. No drift window.

## Active initiative

**Fix — buyer-web home products parse** (started 2026-05-23). Two real bugs in `apps/buyer-mobile` surfaced during yesterday's tap-nav smoke when the home screen displayed "Une erreur est survenue" for both "Produits populaires" and "Nouveautés" sections:

1. **`popularProductsProvider`** passed `sortBy: 'popular'`. The backend DTO enum is `popularity` — the request 400'd with "sortBy must be one of the following values".
2. **`browseProducts` parser** read `responseData['data'] as List`. The API wraps responses in `{success, data: {data: [...], pagination: {...}}}` (nested envelope for paginated endpoints) — the parser cast the inner *object* to List, throwing TypeError. Even when popular was the broken one, newest also errored from this.

Both fixes touch `apps/buyer-mobile/lib/features/catalog/`. Categories + banners + flash-deals endpoints use a flat envelope (`{success, data: [...]}`) so their existing parsers are correct — bug is isolated to the paginated browse endpoint.

Out of scope: a separate product-detail rendering error on the emulator (likely a model parse issue with the slug=null categories or breadcrumb fields). Defer until reproducible.

Last shipped today: **PR E full** (PRs #175 → #176) — FCM tap-navigation routes via go_router on both apps. End-to-end emulator smoke confirmed.

## Buyer push notifications — fully validated 2026-05-22

End-to-end round-trip confirmed on the emulator: login → `POST /v1/users/device-tokens` → backend row → `firebase-admin.messaging().send` from inside the api container → FCM delivery → notification on device. Buyer FCM stack is production-functional for Android (iOS pending).

Shipped 2026-05-21 / 22:
- **#150** (PR A) — backend `DeviceToken` + endpoints + `PushService` + `OrderNotificationService` push fan-out for all 5 buyer order events.
- **#160** (PR A.5) — `PushService` accepts discrete `FIREBASE_PROJECT_ID` + `FIREBASE_PRIVATE_KEY` + `FIREBASE_CLIENT_EMAIL` env vars (GitHub-Secrets-friendly).
- **#154** — `apk add postgresql-client` in api Dockerfile so manual migrations work via `docker exec`.
- **#155 + #157** — `Apply prod migration` GitHub Action handling `@` in `DATABASE_URL` password.
- **#159** (PR B) — Flutter FCM client + Android config for buyer-mobile.
- **#162** — GoRouter rebuild-on-auth-change fix that was silently breaking OTP login.

Manual migration applied to dev + prod DBs (the `device_tokens` table).

## In-flight PRs

None yet — the home-parse fix about to open from this branch.

## In-flight local branches

- `fix/buyer-products-home-parse` — buyer-mobile home product list fix (current).

## Pending in the push initiative

- **PR C** — iOS scaffold for both apps (`flutter create --platforms=ios .` per app, GoogleService-Info.plist placement, Push Notifications + Background Modes capabilities). APNs `.p8` already uploaded to Firebase Console (same key for buyer + seller — project-wide auth key).
- **PR D** — CI/CD secret injection. Base64-encode the credential files into GitHub Secrets; deploy workflow writes them to `/home/deploy/teka-rdc/secrets/` at deploy time. Today the gitignored credentials only exist on the operator's Mac.
- **PR C** — iOS scaffold for both apps (`flutter create --platforms=ios .` per app, GoogleService-Info.plist placement, Push Notifications + Background Modes capabilities). APNs `.p8` already uploaded.
- **Remaining PR E work** — stock-alert pushes (needs SKU-threshold schema first) + web push evaluation. Tap-navigation + product-approval/rejection + new-review events already shipped.

## Sentry — DSN still missing

Operator next step: create the Sentry project at sentry.io, paste DSN into `.env.production` on the VPS, restart api. Until then `Sentry.init` is skipped and `captureException` is a no-op. Full walkthrough in `docs/sentry.md` § "First-time setup".

## Next candidates (unrelated to push)

Surfaced by a 2026-05-21 code-rot audit. Not yet picked up.

| # | Candidate | Effort | Why |
|---|---|---|---|
| 1 | **Real popularity metric** for `GET /v1/browse/products?sort=popularity` (currently falls back to `createdAt desc`) | M | UX gap — buyers see only newest, no "best-selling" surface. |
| 2 | Mark `AuthProvider.GOOGLE` + retired `PHONE_OTP` paths as `@deprecated` in `packages/shared/src/types/auth.ts` | M | Dead enum members still type-allowed. |
| 3 | Move retired-endpoint e2e tests (`/v1/auth/otp/*`) to `deprecated-e2e.spec.ts` | M | Tests pass but the routes 404 in prod — false confidence. |
| 4 | Bulk Flutter `InputDecoration` border modernization across both mobile apps | S | Not broken, lagging current Material 3 idiom. |

## Recently archived plans

- `~/.claude/plans/archive/partitioned-nibbling-spark.shipped.md` — Rakuten redesign, executed in PRs #67–#73. **Do not re-execute.** Plan files in `~/.claude/plans/archive/` with `.shipped.md` are historical — read for context only.

> Other untouched files in `~/.claude/plans/` (e.g. `calm-soaring-emerson.md`, `fix-ios-push-mighty-nebula.md`) have unknown status. They are not necessarily in-flight — cross-reference against git log + this file before treating one as a backlog item.
