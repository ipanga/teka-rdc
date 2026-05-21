# Status — 2026-05-21

> **What this file is.** A single, hand-edited snapshot of *what is in-flight RIGHT NOW*. Read it first on every resume — before `CLAUDE.md`, before `PROGRESS.md`. When `## Active initiative` gets long, move its contents into `PROGRESS.md` history and reset this file.
>
> **Update rule.** Touch this file in the same commit that starts or ends an initiative. No drift window.

## Active initiative

**Push notifications for buyer** (started 2026-05-21). Multi-PR initiative — full plan in the message that kicked it off; 5 PRs estimated.

- **PR A (in this branch)** — Backend `DeviceToken` model + manual SQL migration; `firebase-admin` install; `PushModule` with `PushService` (gated by `GOOGLE_APPLICATION_CREDENTIALS`, no-op fallback); `POST /v1/users/device-tokens` + `DELETE /v1/users/device-tokens/:token`; wired into `OrderNotificationService` as parallel send next to existing SMS at all 5 buyer-facing order events. `.gitignore` covers all Firebase/APNs credential file patterns.
- **PR B (next)** — Flutter `firebase_core` + `firebase_messaging` + `flutter_local_notifications`, init + permission + token register on cold start, foreground/background handlers, tap → go_router navigation, Android config (google-services.json placed locally, gradle plugin applied).
- **PR C** — iOS scaffold (`flutter create --platforms=ios .`), GoogleService-Info.plist placement, Push Notifications + Background Modes capabilities, APNs .p8 already uploaded to Firebase Console (manual step done 2026-05-21).
- **PR D** — CI/CD secret injection. Base64-encode the three credential files into GitHub Secrets; deploy workflow writes them to `/home/deploy/teka-rdc/secrets/` at deploy time; `docker-compose.prod.yml` mounts that path into the api container at `/secrets/firebase-admin-sdk.json`.
- **PR E** — Runbook + integration into more events (delivery updates, cart reminders). Web push documented as future work only.

**Dev DB migration is pending** — the classifier blocked auto-apply on the cloud dev DB. To apply locally: `psql "$DATABASE_URL" -f apps/api/prisma/migrations/manual/2026-05-21_device_tokens.sql`.

**Prod DB migration is pending** — first prod-apply attempt hit `psql: not found` (api image was Node-on-Alpine without postgresql-client). Add-psql fix is in flight on the `chore/api-image-add-psql` branch; once that deploys, run from the VPS:
```sh
docker compose --env-file .env.production -f docker-compose.prod.yml exec api \
  sh -c 'psql "$DATABASE_URL" -f prisma/migrations/manual/2026-05-21_device_tokens.sql'
```
(Path is relative to the api container's WORKDIR `/app/apps/api`; the earlier instruction used the wrong absolute `/app/prisma/...`.)

Last shipped today (2026-05-21):
- **Sentry repo prep** (PRs #148 → #149) — workflow tag, verify endpoint, runbook.
- **Sentry error tracking** (PRs #144 → #146) — SDK + filter wiring.
- **Android bundle ID rename** (PRs #145 → #146) — `com.tootiye.{teka, tekaseller}`.
- **Profile management** (PRs #138–#143, 2026-05-20 → 2026-05-21).

> **Operator next step (single manual task):** create the Sentry project at sentry.io, then follow `docs/sentry.md` § "First-time setup". After that, `GET /v1/health/sentry-test` (admin-auth) should produce a visible event in the Sentry Issues tab within ~30 seconds.

Last shipped today (2026-05-21):
- **Sentry repo prep** (PRs #148 → #149) — `SENTRY_RELEASE` auto-tag on every deploy, `GET /v1/health/sentry-test` admin endpoint, `docs/sentry.md` runbook.
- **Sentry error tracking** (PRs #144 → #146) — `@sentry/node` v10, `Sentry.init` in `instrument.ts`, `captureException` on unhandled + 5xx.
- **Android bundle ID rename** (PRs #145 → #146) — `com.tootiye.teka` / `com.tootiye.tekaseller`.
- **Profile management** (PRs #138–#143, 2026-05-20 → 2026-05-21).

## In-flight PRs

- **#150** (merged 2026-05-21) → **#151** (merged + deployed 2026-05-21) — PR A backend foundation. **Migration not yet applied** (see notes above).

## In-flight local branches

- `chore/api-image-add-psql` — adds `postgresql-client` to the api Dockerfile so the documented `docker compose exec api sh -c 'psql ...'` migration workflow works in prod. Unblocks the pending DeviceToken migration.

## Next candidates

Surfaced by a 2026-05-21 code-rot audit. Not yet committed to any of them — pick one when starting the next initiative.

| # | Candidate | Effort | Why |
|---|---|---|---|
| 1 | **Real popularity metric** for `GET /v1/browse/products?sort=popularity` (currently falls back to `createdAt desc` per browse.service.ts line ~169) | M | UX gap — buyers see only newest, no real "best-selling" or "trending" surface. Requires a schema column + a sales/views-weighted score + a backfill. |
| 2 | Mark `AuthProvider.GOOGLE` + retired `PHONE_OTP` paths as `@deprecated` in `packages/shared/src/types/auth.ts` and `constants/auth.ts` | M | Dead enum members still type-allowed. Add JSDoc `@deprecated`, plan removal for Q3. |
| 3 | Move retired-endpoint e2e tests (`/v1/auth/otp/*`, seller migration) to `deprecated-e2e.spec.ts` with skip tag | M | Tests pass but the routes 404 in prod — false confidence. |
| 4 | Bulk Flutter `InputDecoration` border modernization across both mobile apps (16 occurrences) | S | Not broken — just lagging current Material 3 idiom. |

## Recently archived plans

- `~/.claude/plans/archive/partitioned-nibbling-spark.shipped.md` — Rakuten redesign, executed in PRs #67–#73 (2026-05-XX). **Do not re-execute.** Moved out of the live plans dir into `archive/` on 2026-05-21 after almost being re-implemented from scratch in a fresh session. Any plan file in `~/.claude/plans/archive/` with a `.shipped.md` suffix is historical — read for context only.

> **Other untouched files in `~/.claude/plans/`** (e.g. `calm-soaring-emerson.md`, `fix-ios-push-mighty-nebula.md`, etc.) have unknown status. They are not necessarily in-flight — cross-reference each against git log + this file before treating one as a backlog item.
