# Sentry runbook

Operational guide for Sentry error tracking across all 6 Teka surfaces. Originally shipped 2026-05-21 as API-only (PR #144). Expanded 2026-05-24 to cover the 3 web apps + 2 Flutter apps (PRs #202–#209, the "Sentry rollout").

This is an opinionated runbook — not a Sentry SDK tutorial. For SDK API details: [Node.js](https://docs.sentry.io/platforms/javascript/guides/node/), [Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/), [Flutter](https://docs.sentry.io/platforms/dart/guides/flutter/).

## Architecture at a glance

Six separate Sentry projects under the `teka-rdc` Sentry org — one per platform surface:

| Surface | Sentry project | SDK |
|---|---|---|
| Backend API (NestJS) | `teka-api` | `@sentry/node` |
| Buyer web | `teka-buyer-web` | `@sentry/nextjs` |
| Seller web | `teka-seller-web` | `@sentry/nextjs` |
| Admin web | `teka-admin-web` | `@sentry/nextjs` |
| Buyer mobile | `teka-buyer-mobile` | `sentry_flutter` |
| Seller mobile | `teka-seller-mobile` | `sentry_flutter` |

Each project receives only its own events — strict separation, no shared dumping ground. Filter inside a project by the `environment` tag (`production`, `development`, `staging`).

## What we capture

| Surface | Source | Tagged as |
|---|---|---|
| API | Unhandled exceptions caught by `HttpExceptionFilter` | `kind: unhandled` |
| API | 5xx `HttpException`s explicitly thrown by app code | `status: 5xx` |
| API | 4xx `HttpException`s | **not captured** (client-driven noise) |
| 3× Next.js | SSR errors (server runtime + edge middleware) | via `instrumentation.ts` |
| 3× Next.js | Client-side React render errors + unhandled promise rejections | via `sentry.client.config.ts` |
| 2× Flutter | `FlutterError.onError` (sync render errors) | auto via `SentryFlutter.init` |
| 2× Flutter | `PlatformDispatcher.onError` (zone-uncaught async errors) | auto via Sentry's appRunner Zone |
| 2× Flutter | Native Android crashes (libapp.so, libflutter.so) | via `sentry-android` JNI |

Every API event carries: `method`, `url` (extra), `user.id` (JWT `sub` or `anonymous`). Web + mobile events carry the user agent + URL or route automatically.

## PII scrubbing — phone numbers

Buyer phone numbers (`+243XXXXXXXXX`) are auth identifiers (CLAUDE.md Rule 13). All 6 surfaces run a `beforeSend` scrubber that replaces matches with `[phone]` before send. Coverage:

| Surface | Location | Scope |
|---|---|---|
| API | `apps/api/src/instrument.ts:scrubPhones` | Entire event payload (recursive) |
| 3× Next.js | `apps/<app>-web/sentry-scrub.ts:scrubPhones` | Entire event payload (recursive) |
| 2× Flutter | `apps/<app>-mobile/lib/core/config/sentry_scrub.dart:scrubBeforeSend` | Event message + breadcrumbs (the realistic leak vectors) |

Sentry's built-in scrubbers handle auth tokens + credit-card patterns; phone numbers aren't in the default list, hence the custom hook.

## Required GitHub Secrets

Set under https://github.com/ipanga/teka-rdc/settings/secrets/actions:

| Secret | Used by |
|---|---|
| `SENTRY_AUTH_TOKEN` | `deploy.yml` (Next.js source-map upload via `withSentryConfig`) + `build-mobile-apk.yml` (Flutter symbol upload via `sentry-dart-plugin`). One org-scoped token, scopes: `project:read` + `project:write` + `project:releases`. |
| `NEXT_PUBLIC_SENTRY_DSN_BUYER_WEB` | Browser-side DSN for buyer-web (baked into bundle at build time) |
| `NEXT_PUBLIC_SENTRY_DSN_SELLER_WEB` | Browser-side DSN for seller-web |
| `NEXT_PUBLIC_SENTRY_DSN_ADMIN_WEB` | Browser-side DSN for admin-web |
| `SENTRY_DSN_BUYER_MOBILE` | Passed via `--dart-define` in `build-mobile-apk.yml`, consumed by `FlavorConfig.instance.sentryDsn` |
| `SENTRY_DSN_SELLER_MOBILE` | Same for seller-mobile |

DSNs are technically write-only public keys (Sentry's design) so it's safe to expose them in client bundles. We keep them in Secrets purely for rotation flexibility (rotate via Sentry → Project → Settings → Client Keys, then update the secret — no code change).

## Required VPS env (`/home/deploy/teka-rdc/.env.production`)

These flow to the server-side SDK init in each container via `env_file: .env.production` in `docker-compose.prod.yml`:

```
SENTRY_DSN=https://...@o4511429601067008.ingest.de.sentry.io/4511444683194448      # API
SENTRY_DSN_BUYER_WEB=https://...@o4511429601067008.ingest.de.sentry.io/4511444707311696
SENTRY_DSN_SELLER_WEB=https://...@o4511429601067008.ingest.de.sentry.io/4511444712423504
SENTRY_DSN_ADMIN_WEB=https://...@o4511429601067008.ingest.de.sentry.io/4511444715503696
SENTRY_ENVIRONMENT=production
```

`SENTRY_RELEASE` is auto-exported by `deploy.yml` before each `docker compose up` — don't set it manually in `.env.production`.

After editing, restart the affected containers:
```sh
docker compose --env-file .env.production -f docker-compose.prod.yml restart api buyer-web seller-web admin-web
```

This is a hard restart (~2s gap of 502s). Schedule during low traffic.

## Configuration knobs (consistent across all 6 surfaces)

| Knob | Value | Rationale |
|---|---|---|
| `sampleRate` | `1.0` (100% of errors) | DRC traffic volume is low; we'd rather over-collect than miss. Revisit if event volume becomes a quota problem. |
| `tracesSampleRate` | `0` (no perf tracing) | Errors-only. Performance tracing is a separate initiative. |
| `environment` | `SENTRY_ENVIRONMENT` env, falls back to `NODE_ENV` (web/API) or `FlavorConfig.envName` (mobile) | Both staging + prod containers ship with `NODE_ENV=production`, so the explicit `SENTRY_ENVIRONMENT` is what separates them in the UI. |
| `release` | `SENTRY_RELEASE` env = git short SHA, set by `deploy.yml` / `build-mobile-apk.yml` | Groups errors per-release in the Sentry "Releases" tab. |

Flutter-specific:
- Mobile DSN comes from `FlavorConfig.instance.sentryDsn` which reads `--dart-define=SENTRY_DSN=...`. CI passes the per-app secret; local dev defaults to empty (SDK init is skipped).
- Environment is set to `FlavorConfig.envName` — `development` / `staging` / `production` matches the Android flavor.

## Source maps + native debug symbols

| Surface | Mechanism | Triggers when |
|---|---|---|
| API | **None.** TypeScript stack traces stay readable because `tsx` runs sources directly + we don't minify Node code. | N/A |
| 3× Next.js | `withSentryConfig` in `next.config.ts` uploads JS source maps during `next build` | `SENTRY_AUTH_TOKEN` env present in the build stage |
| 2× Flutter | `sentry-dart-plugin` uploads native debug symbols (libapp.so etc) after build | `SENTRY_AUTH_TOKEN` env present + `sentry.properties` config |

For mobile, the plugin config is in `apps/<app>-mobile/sentry.properties`:
```properties
org=teka-rdc
project=teka-<buyer|seller>-mobile
upload_debug_symbols=true
upload_source_maps=false
commits=false                # skip per-commit release linking
```

The `commits=false` skips Sentry's release-finalize "set commits" call, which would need `org:read` on the token + a Sentry-to-GitHub Git integration. Neither set up today; we don't use per-commit issue resolution.

## First-time setup

If you're standing up a Sentry project from scratch:

1. Create the project in https://sentry.io/organizations/teka-rdc/projects/new/. Use these platform/framework choices: see `docs/mobile-flavors.md` (no, kidding — pick Node.js → Nest.js for the API; Next.js for the 3 webs; Flutter for the 2 mobile apps).
2. Copy the DSN (Settings → Client Keys).
3. Add it to GitHub Secrets + the VPS `.env.production` per the tables above.
4. For webs + mobile: ensure `SENTRY_AUTH_TOKEN` is set in GitHub Secrets too (org-scoped, one token covers all 6 projects).
5. Trigger the appropriate CI to test:
   - **API**: SSH to VPS, edit `.env.production`, restart api container, hit `https://api.teka.cd/api/v1/health/sentry-test` (admin auth required).
   - **3 webs**: trigger a deploy (`gh workflow run deploy.yml` or merge to main); errors will start flowing once the new image rolls.
   - **2 mobile**: trigger `Build mobile APK` from the Actions tab.

For verification, watch https://sentry.io/organizations/teka-rdc/issues/ — event should land within ~30s.

## Build flow

### Next.js apps

Build args are wired in `deploy.yml`'s "Compute build args" step. For each web, three Sentry-related args reach the Dockerfile:

| ARG | Source | Lifecycle |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN_<APP>` | GitHub Secret | Inlined into client bundle via Next.js's `NEXT_PUBLIC_*` mechanism |
| `SENTRY_RELEASE` | `github.sha` | Stamped on every event sent from this build |
| `SENTRY_AUTH_TOKEN` | GitHub Secret | Build-stage only — never copied to the `runner` image |

`withSentryConfig` in `next.config.ts` picks up the auth token + release at build time and uploads source maps as part of `next build`. No separate upload step.

### Flutter apps

In `build-mobile-apk.yml`, after `flutter build apk`:
1. The build itself runs with `--dart-define=SENTRY_DSN=<per-app secret> --dart-define=SENTRY_RELEASE=<sha>` overriding the empty defaults in `flavors/*.json`.
2. A separate "Upload Sentry debug symbols" step runs `flutter pub run sentry_dart_plugin` which calls Sentry CLI to upload `.so` files.

Step warns + skips cleanly when `SENTRY_AUTH_TOKEN` is unset. Otherwise plugin failures bubble up — no silent swallowing.

## Day-2 ops

### When an alert fires

1. Click through to the event in Sentry.
2. Read the stack trace + the breadcrumbs leading up to it.
3. Check `user.id` (API) / `user agent` (web/mobile) — anonymous? authenticated?
4. Check the Release tag — is this a regression in the latest deploy, or a pre-existing issue surfacing only now?
5. If regression: `git revert` the merge commit (see [CONTRIBUTING.md](/CONTRIBUTING.md)) or push a hotfix through the standard `develop → main` flow.
6. If pre-existing: open a GitHub issue, link the Sentry event, triage normally.

### Tuning alert noise

- Sentry's default alert rule fires on every new issue. Tune via Project → Alerts.
- API: 5xx `HttpException`s from `health/ready` (cloud DB maintenance flap) will fire — consider an ignore rule on `transaction:GET /v1/health/ready`.
- Web: hydration-mismatch errors from outdated cached pages will fire on every deploy — consider an ignore rule for the first 5min after a release.
- Mobile: tap-storm crashes from a misbehaving widget can flood; throttle via Project → Settings → Inbound Filters.

### Quota

- Free tier is 5K events / month, shared across all 6 projects.
- DRC launch traffic should fit easily. If you hit the cap, Sentry drops events silently — no alert.
- Check https://sentry.io/organizations/teka-rdc/stats/?dataCategory=errors weekly during the first month.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| API: events not arriving after DSN paste | container env didn't pick up the new var | `docker compose exec api printenv SENTRY_DSN`; restart if empty |
| Webs: client-side errors not arriving but SSR ones do | `NEXT_PUBLIC_*` build arg missing — bundle has empty DSN | Check `deploy.yml` build-args step + GitHub Secret presence |
| Webs: SSR errors not arriving but client-side do | `SENTRY_DSN_<APP>` missing from `.env.production` | Add to VPS, restart container |
| Mobile: events not arriving from APK | `--dart-define=SENTRY_DSN=...` missing or empty | Check `build-mobile-apk.yml` step `Resolve per-app Sentry DSN` output |
| Mobile: symbol upload step exits non-zero | Plugin config issue or auth-token scope | Inspect step log; common causes: missing `commits=false`, missing `project:write` scope |
| CI deploy: `SecretsUsedInArgOrEnv` Docker warning | BuildKit static-analysis lint on `SENTRY_AUTH_TOKEN` ARG | Non-blocking. Token stays in build stage only. Future-proof fix: BuildKit `--mount=type=secret`. |

## Known follow-ups

- **Switch Next.js Dockerfile to BuildKit secret mount** for `SENTRY_AUTH_TOKEN` (`--mount=type=secret,id=SENTRY_AUTH_TOKEN ...`). Silences the lint; defense in depth.
- **`disableLogger` → `webpack.treeshake.removeDebugLogging`** in `next.config.ts` (deprecation warning during build).
- **`sentry.client.config.ts` → `instrumentation-client.ts`** for Turbopack compatibility (deprecation warning).
- **Set up Sentry GitHub integration** + grant `org:read` to the auth token, then re-enable `commits=true` in `sentry.properties` for per-commit issue resolution.
- **Performance tracing** when there's a specific perf question worth answering. Set `tracesSampleRate` to `0.1` per surface and tune from there.
- **API source-map upload** — TypeScript is run as source today via `tsx`, so this is moot. Becomes relevant if we move the API to a compiled build.

## What's intentionally not done

- **No performance tracing.** `tracesSampleRate: 0` across all 6 surfaces. Errors-only is enough today.
- **No commit-tracking on releases.** `commits=false` in `sentry.properties` + workflow doesn't run `sentry-cli releases set-commits`. Needs `org:read` token scope + Sentry GitHub integration first.
- **No per-flavor Sentry projects for mobile.** Both flavors of buyer-mobile send to `teka-buyer-mobile`; the `environment` tag (`development`/`staging`/`production`) separates them inside the project.
- **No PII scrubbing for non-phone identifiers.** Email + user IDs flow through as-is. Add if a specific privacy review surfaces a concern.

## Code references

- `apps/api/src/instrument.ts` — API SDK init + phone scrubber.
- `apps/api/src/common/filters/http-exception.filter.ts` — `captureException` call sites for 5xx + unhandled.
- `apps/api/src/health/health.controller.ts` (`sentry-test` endpoint) — verification trigger (admin auth required).
- `apps/<buyer|seller|admin>-web/sentry.{client,server,edge}.config.ts` — per-runtime SDK init.
- `apps/<buyer|seller|admin>-web/sentry-scrub.ts` — phone scrubber (mirrors API).
- `apps/<buyer|seller|admin>-web/instrumentation.ts` — Next.js 15 hook for server + edge runtimes.
- `apps/<buyer|seller|admin>-web/next.config.ts` — `withSentryConfig` wrap.
- `apps/<buyer|seller>-mobile/lib/main.dart` — `SentryFlutter.init` wrapping `appRunner`.
- `apps/<buyer|seller>-mobile/lib/core/config/sentry_scrub.dart` — phone scrubber (mirrors API + web).
- `apps/<buyer|seller>-mobile/sentry.properties` — plugin config (org/project/upload flags).
- `.github/workflows/deploy.yml` (`Compute build args` step) — per-web build-arg expansion.
- `.github/workflows/build-mobile-apk.yml` (`Resolve per-app Sentry DSN` + `Upload Sentry debug symbols` steps).
- `docker-compose.prod.yml` — `env_file: .env.production` + `SENTRY_*` interpolation per service.
