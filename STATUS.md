# Status — 2026-06-04

> **What this file is.** A single, hand-edited snapshot of *what is in-flight RIGHT NOW*. Read it first on every resume — before `CLAUDE.md`, before `PROGRESS.md`. When `## Active initiative` gets long, move its contents into `PROGRESS.md` history and reset this file.
>
> **Update rule.** Touch this file in the same commit that starts or ends an initiative. No drift window.

## Active initiative

**Wishlist (Favorites) completion & hardening** — buyer-web + buyer-mobile + API. Master tracker
(audit, gap analysis, phased PR plan, risks, rollback, resume protocol):
**`tasks/wishlist-completion-progress.md`** (read its "⏯ RESUME HERE" block first).

- **Investigation: COMPLETE.** Wishlist already exists end-to-end (not greenfield). Core add/remove/
  list/page works on all 3 surfaces; gaps are consistent: heart only on PDP (missing from grids),
  no move-to-cart, no count badge, guest UX, mobile has no analytics, API lacks a count endpoint +
  doesn't validate product status on add.
- **3 decisions RESOLVED:** guest heart → login → auto-continue; keep `wishlist_added`/`removed` +
  add `wishlist_viewed` + `wishlist_item_moved_to_cart`; "Add to cart" keeps the item in the wishlist.
- **PR-1 (API): COMPLETE + green** on `feat/wishlist-api` (type-check + 33 unit + 92 e2e).
  `GET /v1/wishlist/count`; add validates `ACTIVE` status; `/check` UUID-filtered; new service unit
  spec (11) + 2 e2e auth contracts.
- **Next:** PR-2 buyer-web (listing-surface hearts + ids store + count badge), PR-3 web (wishlist page
  move-to-cart + guest flow + analytics), PR-4/5 mobile, PR-6 docs.

> **Prior initiative (PostHog rollout): SHIPPED to prod** 2026-06-04 — see Recently completed below.

## Recently completed — 2026-06-04

**PostHog platform rollout** (8-PR initiative, PR-1→8). Master tracker: `tasks/posthog-rollout-progress.md`.
Authoritative reference (rewritten platform-wide): `docs/analytics.md`. Merged to `develop`: **#262–#268**
+ docs/closeout. **Not yet released to `main`.**

**Net effect:** PostHog extended from buyer-web-only to **all 6 surfaces** — api (`posthog-node`
`@Global AnalyticsModule`/`PostHogService`, server-owned auth/order/payment/admin events), seller-web +
admin-web (cloned the buyer-web provider), buyer-web custom UI event taxonomy, and both Flutter apps
(`posthog_flutter`, screen+lifecycle+identity, byte-for-byte lockstep). One US-Cloud project;
`distinctId = user.id` everywhere; identity carries **id+role only** (never phone/email); each event has
ONE authoritative owner (server=transactional, client=UI-intent — no duplication); `api_error` +
`notification_sent` excluded by decision. `POSTHOG_API_KEY` wired into the api container
(deploy.yml/compose); the 3 web `NEXT_PUBLIC_POSTHOG_KEY_*` GitHub Secrets + the API secret are
provisioned; mobile keys are per-flavor (prod injected at build). R2 fixed (dev keys empty). Green
throughout: api 22 unit + 90 e2e; web type-check + `pnpm build`; mobile `flutter analyze` + tests.

**Decisions captured:** single prod project + dev keys empty; system events = `payment_*` only;
API-first sequencing; `posthog_flutter` (official) approved. **Deferred:** custom buyer-mobile ecommerce
events; server-side flag bootstrap; replay↔Sentry linking; on-device mobile init verification (analyze +
unit-tested only — add `AUTO_INIT=false` manifest meta-data if a startup warning appears).

**Note for future work:** repo `pnpm lint` is pre-existing-red (510 errors in untouched files) — NOT a
CI gate; type-check + tests are. Never run the broad `pnpm lint` (`--fix` rewrites unrelated files);
scope eslint to edited files.

## Recently completed — 2026-05-27

**Mobile connectivity management** (7-PR initiative, PR1 → PR7). Plan archived at `~/.claude/plans/archive/mobile-connectivity-management.shipped.md`. Authoritative reference: `docs/mobile-connectivity.md`. New CLAUDE.md Rule 15 enshrines the hard rules.

**Net effect:** Both Flutter apps (`buyer-mobile` + `seller-mobile`, kept byte-for-byte identical) now ship a centralized 5-state connectivity machine (`connected | unstable | noInternet | disconnected | reconnecting`), a 4-layer Dio interceptor chain (`OfflineAware → Auth → Retry → Log`), a global 5-color banner above every route, app-lifecycle pause/resume hooks, SharedPreferences-backed cart persistence with offline-safe hydration, hard-block checkout on offline, connectivity-aware auth-refresh that no longer logs users out on transient timeouts, and rate-limited Sentry capture on real degradations. 54 buyer-mobile specs; same coverage in seller-mobile.

- **#243 → #244** (PR1) — Core foundation. `ConnectivityStatus` enum + `ConnectivitySnapshot`, `ConnectivityService` with injectable `interfaceStream` + `probe`, Riverpod providers. Probe hits `${ApiConstants.baseUrl}/v1/health` with 3s timeout; 30s healthy cadence; 5s `noInternet` cadence; 2-slow-probes-to-unstable / 1-fast-out hysteresis. `connectivity_plus ^6.0.0` added.
- **#245 → #246** (PR2) — Dio integration. `RetryInterceptor` (full-jitter `[0..500ms, 0..1500ms, 0..4000ms]` capped 5s, GET/HEAD only or `extra: {retryable: true}` opt-in), `OfflineAwareInterceptor` (synthesizes `connectionError` on non-safe verbs when disconnected; `extra: {allowOffline: true}` opt-out for cache-driven reads). `AuthInterceptor` distinguishes connectivity-caused refresh failure (`connectionTimeout` / `receiveTimeout` / `sendTimeout` / `connectionError` / `502/503/504`) from real 401s — tokens preserved on the former. 19 unit tests.
- **#247 → #248** (PR3) — Global UI banner. `ConnectivityBannerHost` mounted via `MaterialApp.router.builder`. Red / orange / green by state. `_previousOfflineStatus` only tracks `disconnected` + `noInternet` so startup `reconnecting → connected` doesn't flash green. `AnimatedSize` + `AnimatedSwitcher` 200ms. 5 new `app_fr.arb` keys + regen of `app_localizations*.dart`. 8 widget tests with `_settleEmission` helper.
- **#249 → #250** (PR4) — Lifecycle integration. `ConnectivityLifecycleObserver(ConsumerStatefulWidget + WidgetsBindingObserver)` wraps the banner host. `paused/inactive/hidden → service.pause()`, `resumed → service.resume()`. Deliberately does **not** invalidate authProvider on resume — PR2's auth interceptor already handles it. 8 widget tests.
- **#251 → #252** (PR5) — Offline behavior. `TypedCache` (SharedPreferences-backed envelope `{v:1, savedAt, ttlMs, value}`, stale-while-reconnecting). `main.dart` preloads `SharedPreferences` and overrides `sharedPreferencesProvider` (was throwing `UnimplementedError`). `CartNotifier` hydrates from cache synchronously → `fetchCart` updates silently. 30-day TTL. Checkout review step watches `isOfflineProvider`: button disabled + permanent banner "Connexion requise pour passer commande" with `Icons.wifi_off_outlined`. 9 unit tests.
- **#253 → #254** (PR6) — Sentry monitoring. `ConnectivitySentryReporter`: `connectivity_state` tag on every event via `Sentry.configureScope`, breadcrumb (category `connectivity`) on every transition, rate-limited (1/min) capture on `connected → noInternet` + ≥5 consecutive `noInternet` snapshots. `RetryInterceptor` adds `_maybeCaptureBudgetExhaustion` for retry-budget exhaustion (also 1/min). Uses recommended `setContexts` API instead of deprecated `setExtra`. No-op when `SENTRY_DSN` is empty.
- **PR7** (this commit) — Docs + cleanup. New `docs/mobile-connectivity.md` (authoritative reference: state machine ASCII diagram, retry / offline / observability tables, "adding a new feature" checklist, deferred work). CLAUDE.md Rule 15 "Mobile connectivity discipline" (hard rules: never bypass the chain, never `retryable: true` on non-idempotent calls, never log creds/tokens/phones, mirror buyer-mobile ↔ seller-mobile in same PR). `docs/architecture.md` gains a "Mobile network-resilience layer" subsection. Deduped 6 copies of `_extractErrorMessage(DioException)` in buyer-mobile feature providers into one shared `apps/buyer-mobile/lib/core/network/dio_error_messages.dart`. STATUS closeout + plan-file archival.

**Locked decisions captured for future maintainers:**
- Reachability probe is `${ApiConstants.baseUrl}/v1/health` — no `internet_connection_checker_plus` dependency. The probe target is what the API considers "alive," not a generic public IP.
- Cart persists to SharedPreferences. Cart **mutations** when offline are blocked (no queue-and-replay) — replay would race against price + stock changes during the offline window.
- Order placement when offline is hard-blocked at the checkout review step (button + permanent banner). No queue-and-replay anywhere.
- The two Flutter trees are kept byte-for-byte identical for the connectivity layer; changes must ship in lockstep.
- Cache wiring is opt-in. Today only the cart is wired; `productsList` / `categoriesTree` / `userProfile` / `sellerOrdersList` keys are reserved in `cache_keys.dart` but unused — future opt-in pass.

## Recently completed — 2026-05-25 → 2026-05-26

**Orange + Africa's Talking SMS + Flexpay Mobile Money removal** (10-PR initiative, A1 → D3). Plan archived at `~/.claude/plans/archive/orange-flexpay-removal.shipped.md`. The 2026-05-24 outage gap (operator stripped `ORANGE_*` / `FLEXPAY_*` envs from `.env.production` before the API was tolerant of them missing → Joi crash-loop for ~2h) is now permanently closed.

**Net effect:** ~1450 lines deleted across 50+ files, ~250 added. 10 feature PRs + 7 release PRs + 1 docs/closeout PR shipped to main. The api boots silent (no `SMS_PROVIDER=mock` warning), broadcasts compose with 500 chars instead of 160, admin UI shows Push + Email only, checkout is COD-only, `apps/api/src/sms/` directory is gone, 14 env keys dropped from Joi validation + stripped from `.env.production` on the VPS.

**Phase A — notification rerouting (additive):**
- **#221 → #222** (A1) — `EmailService.sendOrderNotification` + 5 buyer order-event email templates (confirmed / shipped / delivered / cancelled / payment-confirmed). French, brand red, inline styles. Dormant until A2.
- **#223 → #224** (A2) — `OrderNotificationService` swapped its dead `sendSms()` stub for `pushOrEmail()`: push via FCM primary; falls back to email when `PushService.sendToUser` returns `succeeded=0`. Sellers stay push-only.
- **#225 → #226** (A3) — `BroadcastsService` dual-publish: new `NotificationBroadcast.channels Json?` column (manual SQL migration `2026-05-25_broadcast_channels.sql` applied via `Apply prod migration` workflow), per-broadcast `{push, email, sms}` toggle with default `{push:true, email:true, sms:false}`. `EmailService.sendBroadcast` + `broadcast.template.ts` shipped. `NotificationPrefs` extended with `pushBroadcasts` + `emailBroadcasts` opt-outs.

**Phase B — Flexpay + MM UI deletion:**
- **#227** (B1) — Dead Mobile Money UI removal across buyer-web + buyer-mobile + `@teka/shared`. Removed `ENABLE_MOBILE_MONEY` toggle, MM tile + provider picker + payer-phone input, `MobileMoneyProvider` shared type + constants. `PaymentMethod` union kept for legacy-order display.
- **#228 → #229** (B2) — API Flexpay deletion. Removed `apps/api/src/payments/providers/`, `apps/api/src/payments/interfaces/`, `initiate-payment.dto.ts`. Simplified `PaymentsModule` / `PaymentsController` / `PaymentsService` to COD-only — no `PAYMENT_PROVIDER` factory, no `POST /v1/payments/initiate`, no `POST /v1/payments/webhook/flexpay` (both 404 now), no `handlePaymentCallback`. `CheckoutDto.paymentMethod` narrowed to `'COD'` only (legacy MM POSTs get a clean French 400). Pre-flight verified: prod had 0 pending FLEXPAY transactions.
- **#230** (B3) — Admin broadcasts channel picker (Push + Email + dimmed SMS-déprécié). POST body now sends `channels: { push, email, sms }`. Form save disabled until at least one channel selected.

**Phase C — env validation + SMS module deletion (the load-bearing change):**
- **#231 → #232** (C1) — Dropped 14 env keys from Joi schema (`SMS_PROVIDER`, `ORANGE_*` × 4, `AT_*` × 3, `FLEXPAY_*` × 5, `PAYMENT_MOCK_MODE`). Flipped `sms.module.ts` JS-level `SMS_PROVIDER` fallback `'orange' → 'mock'` so the post-strip default is safe no-op + loud `warnIfMockInProd` startup ERROR. **Operator then stripped the 14 keys from `.env.production` on the VPS** — boot confirmed clean (`[SmsProviderFactory] ERROR ⚠️  SMS_PROVIDER=mock` log line emitted as expected).
- **#233 → #234** (C2) — Deleted `apps/api/src/sms/` directory entirely (`SmsService`, `SmsModule`, Orange DRC + AT + mock providers, `sms-provider.interface.ts`). Dropped SMS branch from `BroadcastsService.processBroadcastSending` + `BroadcastChannels.sms` field + `BROADCAST_DEFAULT_CHANNELS.sms`. Dropped `smsBroadcasts` from `NotificationPrefs` DTO + resolver + `shouldSendBroadcasts` predicate (no callers after C2). Bumped broadcast `message.MaxLength` 160 → 500. Cleaned admin-web (SMS checkbox + `smsBroadcasts` profile toggle gone, 4 i18n keys dropped). **Kept `smsOrderUpdates` + `shouldSendOrderUpdates`** — name is legacy but the field still gates push + email-fallback order events (renaming would need a JSON data migration; out of scope).

**Phase D — cleanup:**
- **#235** (D1) — Seed updates: sample orders 2 + 5 paymentMethod `MOBILE_MONEY → COD`; order 5 paymentStatus `REFUNDED → FAILED` (COD-cancelled means no money was ever taken). 3 sample transactions provider `FLEXPAY → COD`. Fixed a pre-existing seed inconsistency where order 3's transaction was FLEXPAY while the order itself was already COD.
- **#236** (D2) — Docs sweep: `CLAUDE.md` (Rule 11 + 14 rewritten, § 2 Tech Stack, § 3 env vars, post-phase chronology entry), `docs/architecture.md` (3-stack messaging diagram, Payment Webhook section removed, COD-only design decision), `docs/api-reference.md` (removed endpoints callout, payouts manual-ops note), `docs/deployment.md` (env-vars table + go-live checklist purged of SMS + Flexpay).
- **D3** (this commit) — STATUS closeout + plan-file archival.

**Decisions captured for future maintainers:**
- `PaymentMethod.MOBILE_MONEY` + `TransactionProvider.FLEXPAY` Prisma enum values **stay forever** — required for read-side rendering of legacy orders/transactions.
- `smsOrderUpdates` field name kept despite the SMS branch being gone (storage-format back-compat; documented inline in `notification-prefs.dto.ts`).
- Re-introducing automated payments would mean adding a new provider abstraction from scratch — none currently exists in the codebase.
- Re-introducing SMS would need a written architecture decision per Rule 11 (the removal closed a load-bearing outage gap).

## In-flight PRs

None.

## In-flight local branches

None.

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

- `~/.claude/plans/archive/orange-flexpay-removal.shipped.md` — **Orange + AT SMS + Flexpay removal**, executed in PRs #221–#236 (May 25–26, 2026). **Do not re-execute.** See "Recently completed — 2026-05-25 → 2026-05-26" above for the full PR list and decisions captured for maintainers.
- `~/.claude/plans/archive/partitioned-nibbling-spark.shipped.md` — Rakuten redesign, executed in PRs #67–#73. **Do not re-execute.** Plan files in `~/.claude/plans/archive/` with `.shipped.md` are historical — read for context only.

> Other untouched files in `~/.claude/plans/` (e.g. `calm-soaring-emerson.md`, `fix-ios-push-mighty-nebula.md`) have unknown status. They are not necessarily in-flight — cross-reference against git log + this file before treating one as a backlog item.
