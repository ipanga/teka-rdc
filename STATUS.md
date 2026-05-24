# Status — 2026-05-24

> **What this file is.** A single, hand-edited snapshot of *what is in-flight RIGHT NOW*. Read it first on every resume — before `CLAUDE.md`, before `PROGRESS.md`. When `## Active initiative` gets long, move its contents into `PROGRESS.md` history and reset this file.
>
> **Update rule.** Touch this file in the same commit that starts or ends an initiative. No drift window.

## Active initiative

None. Last initiative (mobile Android flavors, 3-PR series) completed 2026-05-24.

## Recently completed — 2026-05-24

**Mobile Android flavors** — both Flutter apps now ship as three Android product flavors (`development` / `staging` / `production`) so dev / staging / prod builds can install side-by-side with their own bundle IDs and display names. Production keeps its existing applicationId so the Play Store listing is unaffected; dev/staging get `applicationIdSuffix` (`.dev` / `.staging`). iOS flavors are intentionally out of scope — wait on the long-deferred PR C (iOS scaffold) below. Documented in `docs/mobile-flavors.md`.

PRs in order:
- **#195 → #196** (PR 1) — Android flavor scaffold for both apps. `flavorDimensions` + `productFlavors` in `build.gradle.kts`, `AndroidManifest.xml` switched to `@string/app_name`, new `lib/core/config/flavor.dart` + `flavors/{dev,staging,prod}.json` consumed via `--dart-define-from-file`. `ApiConstants.baseUrl` delegates to `FlavorConfig.instance.apiBaseUrl`. Production-flavor APK verified on emulator (home screen renders picsum images from `api.teka.cd`).
- **#197 → #198** (PR 2) — Flavor-aware `Build mobile APK` workflow. Two-axis matrix (`app × flavor`), `--flavor` + `--dart-define-from-file` in the build step, artifact names include flavor. Smoke run (`app=buyer, flavor=production, variant=release`) green → `app-production-release.apk` (58.9 MB) artifact.
- **#199 → #200** (PR 3) — `docs/mobile-flavors.md`: architecture, build commands (local + CI), Firebase Console steps to enable dev/staging, secret management, "adding a new environment" runbook, common-error reference.

**Dev seed Teka Officiel email collision** (#193 → #194). `seedTekaOfficielSeller()` was upserting by `User.id` but creating with `email = 'ipanga@outlook.fr'` (the operator's real email, set 2026-05-18). Any dev DB with the operator's user at a different id blew up at the seller create with P2002 on email. Rewrote as three-path resolution: id match → update; else email match → adopt that user as the platform seller; else create fresh with canonical id. Sample products chain to whichever id we resolved. Prod path unchanged — production's Teka Officiel matches by canonical id (path 1).

## Recently completed — 2026-05-23

**Buyer-mobile OTP error humanization** (#190 → #191). Verify screen was rendering raw `DioException.toString()` on 401, dumping an 8-line trace + MDN HTTP-docs link + "fix your request code" advice onto the user. Replaced with inline helper that surfaces the API's French `error.message` (e.g. "Code OTP invalide ou expiré"), with status-keyed fallbacks for 400/401/429 and a generic catch-all. Verified on emulator with wrong code → clean one-liner. Helper duplicated four ways now (catalog/checkout/cart + new OTP); a shared-util promotion is a logical next refactor.

**`Run prod seed` workflow** shipped end-to-end. Re-fired prod seed, prod product_images now point at per-product picsum.photos URLs (confirmed via `GET https://api.teka.cd/api/v1/browse/products?limit=1` returning `image.url=https://picsum.photos/seed/<productId>-0/600/600`). Buyer-mobile home screen also visually verified rendering the new picsum images.

PRs in order:
- **#183 → #184** — `Run prod seed` workflow_dispatch action (concurrency-locked, `confirm: RUN` guardrail).
- **#185 → #186** — 3-tier tsx resolver in the workflow (pnpm symlink, raw cli.mjs, or ephemeral global install) after first fire hit `tsx not found` on the prod image.
- **#187 → #188** — seed.ts: prod mode reuses the oldest existing ADMIN row via lookup instead of trying to upsert one (per `docs/deployment.md § 5b`, prod admins are seeded out-of-band; the old `requireInProd` would have either no-op'd or created a duplicate admin on every re-seed). Opt-in via `SEED_INCLUDE_ADMIN=true`.
- **#190 → #191** — buyer-mobile OTP verify error humanization (see above).

## Open follow-ups from the flavors initiative

- **One-time Firebase Console step (per app).** Add `com.tootiye.teka.dev` + `com.tootiye.teka.staging` as Android apps in the buyer Firebase project. Repeat for `com.tootiye.tekaseller.{dev,staging}` in the seller project. Re-download the merged `google-services.json` and replace the local file + the `{BUYER,SELLER}_GOOGLE_SERVICES_JSON_B64` GitHub secrets. Until this is done, dev + staging flavor builds fail at `:processGoogleServices*` with a clean actionable error. Procedure in `docs/mobile-flavors.md § Firebase setup`.
- **Staging backend infra.** Staging is hypothetical for now; `flavors/staging.json` carries the placeholder `https://staging.api.teka.cd/api`. When real infra lands, flip the URL + (optionally) provision a dedicated Firebase project + Sentry DSN.
- **Per-flavor Firebase secrets (later).** Today one `google-services.json` per app covers all 3 packages. When separate Firebase projects per env exist, split into `_DEV` / `_STAGING` / `_PROD` GitHub secrets and select per `matrix.flavor` in the workflow. Flagged inline in `.github/workflows/build-mobile-apk.yml`.
- **iOS flavors.** Blocked on the long-deferred PR C (iOS scaffold for both apps). When PR C lands, mirror the Android flavor shape: Xcode schemes per flavor, per-flavor `GoogleService-Info.plist`, bundle IDs matching Android.
- **Real signing keystore.** Today release builds sign with the debug keystore (`signingConfig = signingConfigs.getByName("debug")` in both apps). Must replace before Play Store submission.

## Open follow-ups from earlier today

- **Promote `extractApiError(DioException)` to a shared util**. Four copies now (catalog/checkout/cart + OTP).

**Earlier same day:**
- **#181 → #182** — seed change: per-product Picsum URLs + mutable image upsert (so re-seed actually propagates).
- **#179 → #180** — buyer home product card 7px overflow fix.
- **#177 → #178** — buyer home product list sortBy + envelope-parse bugs.

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

None.

## In-flight local branches

None.

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
