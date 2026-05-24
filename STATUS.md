# Status — 2026-05-24

> **What this file is.** A single, hand-edited snapshot of *what is in-flight RIGHT NOW*. Read it first on every resume — before `CLAUDE.md`, before `PROGRESS.md`. When `## Active initiative` gets long, move its contents into `PROGRESS.md` history and reset this file.
>
> **Update rule.** Touch this file in the same commit that starts or ends an initiative. No drift window.

## Active initiative

None. Last work today (BuildKit secret mount + instrumentation-client rename) released to main at 2026-05-24 20:49 UTC.

**Next up (when ready):** Orange + Africa's Talking SMS + Flexpay removal — see "Open follow-ups from today's outage" below. This is the proper fix for the env-var saga that broke prod today.

## Recently completed — 2026-05-24

**Sentry deprecation cleanups** (#215 + #216, released via #217).
- **#215** — `SENTRY_AUTH_TOKEN` now ships via BuildKit secret mount (`RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN`) on the 3 web Dockerfiles, with a matching `secrets:` block on `docker/build-push-action` in `deploy.yml`. Silences the `SecretsUsedInArgOrEnv` Docker BuildKit lint that fired on every deploy. Token never lands in any image layer (was already build-stage only; now also out of metadata).
- **#216** — `sentry.client.config.ts` → `instrumentation-client.ts` × 3 webs (via `git mv`, preserves history). Silences the `@sentry/nextjs` 10.x deprecation warning + makes the apps Turbopack-ready.
- Post-merge deploy ran clean; both targeted warnings gone from the build log. The `disableLogger` deprecation is still present (intentionally deferred — needs verification of the exact `webpack.treeshake.removeDebugLogging` config shape for Next.js 15).

**Auto-sync `docker-compose.prod.yml` on deploy** (#212 → #213). Root-cause fix for today's outage: the deploy workflow now scp's the compose file to the VPS before each rolling deploy. Single new step in `deploy.yml` using `appleboy/scp-action@v1`. First post-merge deploy ran clean.

**API outage post-mortem** (~17:30 → 19:30 UTC, ~2h):
1. PR #208 added `env_file: .env.production` to the 3 web services in `docker-compose.prod.yml`. The new image rolled to prod, but **the compose file on the VPS was never synced** (no mechanism — caught by PR #212/#213 above).
2. Operator uploaded a fresh `.env.production` with the Sentry vars added + the `ORANGE_*` / `AT_*` / `SMS_PROVIDER` keys stripped (anticipating a future Orange removal initiative).
3. Operator ran `up -d --no-deps`. Webs didn't pick up the new env (their compose was still pre-PR-208). API was recreated against the stripped `.env.production` and crash-looped on `@nestjs/config` validation (`"ORANGE_CLIENT_ID" is required`) until we noticed.
4. Recovery: restored the missing env vars from `.env.production.bak.*` (the operator had backed up before the upload — saved us); `up -d --no-deps api`; `nginx -s reload` to refresh nginx's cached upstream IPs after the web containers were recreated; verified all 5 services healthy.
5. Sentry capture verified end-to-end via `/v1/health/sentry-test` → event landed in `teka-api` project tagged correctly.

**Sentry rollout — all 6 surfaces** (5-PR initiative). API was already wired (DSN was just empty in prod); the gap was the 5 frontends + DSN values + source-map / debug-symbol upload. All 6 surfaces now capture errors, tag with `environment: production`, and (for webs + mobile) attach source maps / native debug symbols.

PRs in order:
- **#202 → #203** (PR 1) — API: phone-number `beforeSend` scrubber + explicit `SENTRY_ENVIRONMENT` (was using `NODE_ENV` which is "production" in both staging + prod, so couldn't distinguish them).
- **#204 → #205** (PR 2) — `@sentry/nextjs@^10.53.1` wired into buyer-web + seller-web + admin-web. `sentry.{client,server,edge}.config.ts` + `instrumentation.ts` + `sentry-scrub.ts` per app. Per-app env vars (`NEXT_PUBLIC_SENTRY_DSN_<APP>` for client, `SENTRY_DSN_<APP>` for server) so the three apps don't collide on the shared root `.env`.
- **#206 → #207** (PR 3) — `sentry_flutter@^9.20.0` wired into buyer-mobile + seller-mobile via the existing `FlavorConfig.instance.sentryDsn` plumbing. Bumped from 8.x → 9.x because 8.x's Kotlin language version 1.6 is rejected by the project's Kotlin 2.2.20 compiler.
- **#208 → #209** (PR 4) — CI release tagging + source-map / debug-symbol upload across all 6 surfaces. 3× Next.js Dockerfile build-args, `deploy.yml` build-arg expansion + `SENTRY_RELEASE`/`SENTRY_ENVIRONMENT` export, docker-compose env wiring, `build-mobile-apk.yml` `--dart-define` injection + `sentry_dart_plugin` symbol-upload step. Smoke-tested on the PR branch — 8 native symbols uploaded + Sentry release created per APK build.
- **#210 → #211** (PR 5) — `docs/sentry.md` rewritten to cover all 6 surfaces, build flow, required secrets, troubleshooting table, known follow-ups.

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

## Open follow-ups from today's outage

- **Orange + Africa's Talking SMS + Flexpay removal** — the actual root-cause fix for today's outage. Operator stripped these env vars because the underlying services are no longer in use; the API config schema still requires them. Decisions locked in (2026-05-24):
  - Notifications: route via Gupshup WhatsApp templates (today only buyer OTP goes through Gupshup; would need new templates for `order_status`, `payment_received`, broadcasts — each ~24-48h Gupshup approval).
  - Payments: Cash-on-Delivery only — remove Flexpay entirely. Drops MM/Mobile Money UI on buyer-web + buyer-mobile, the entire Flexpay provider + webhook handler, sample MM transactions in seed data.
  - Scope: `apps/api/src/sms/` (4 providers + module), `apps/api/src/payments/` (Flexpay provider + factory + webhooks), `apps/api/src/config/configuration.ts` (drop required keys), `OrderNotificationService` (swap `SmsService` → `WhatsappService`), Gupshup template submissions, mobile + web payment-picker UI, CLAUDE.md (Rule 11 + 14 + Tech Stack), `docs/architecture.md`.
  - Pre-step: submit the new Gupshup templates so they're approved by the time the code lands.

## Open follow-ups from the Sentry rollout

- **`disableLogger: true` deprecation** in 3 `next.config.ts` files — Sentry now recommends `webpack.treeshake.removeDebugLogging` instead. Warning at every build. Deferred pending verification of the exact migration path for Next.js 15 + `@sentry/nextjs` 10.x (the deprecation message names the option but not the config-tree location).
- **Sentry GitHub integration + `org:read` on the auth token** would let us re-enable `commits=true` in `sentry-dart-plugin` config and get per-commit issue resolution in the Sentry UI. Today the workflow sets `commits=false` to avoid the 403 from the missing integration. Operator action in Sentry web UI required first.

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

## Next candidates (unrelated to today's initiatives)

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
