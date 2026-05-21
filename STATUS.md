# Status — 2026-05-21

> **What this file is.** A single, hand-edited snapshot of *what is in-flight RIGHT NOW*. Read it first on every resume — before `CLAUDE.md`, before `PROGRESS.md`. When `## Active initiative` gets long, move its contents into `PROGRESS.md` history and reset this file.
>
> **Update rule.** Touch this file in the same commit that starts or ends an initiative. No drift window.

## Active initiative

**Sentry repo prep** (started 2026-05-21). Followup to #144: pre-stage everything that doesn't need a Sentry account so the moment a DSN is provisioned, verification is a single curl away. Scope:

- **Auto-populated `SENTRY_RELEASE`** — deploy workflow exports `${{ github.sha }}` before invoking compose; `docker-compose.prod.yml` interpolates it into the api service's `environment:`. Errors will group per-release in Sentry's Releases tab automatically.
- **`GET /v1/health/sentry-test`** — admin-only, throws a deterministic `Error` (routes through `kind: unhandled` in the filter) so an operator can verify the pipeline with one curl after the DSN lands.
- **`docs/sentry.md`** — runbook: DSN provisioning, first-time setup, verification, alert tuning, quota, day-2 ops, code references.

`SENTRY_DSN` itself stays empty until the user creates a Sentry project at sentry.io. The SDK already ships as a no-op in that state (from PR #144), so this PR has zero runtime effect until the DSN is set on the VPS.

Last shipped today (2026-05-21, release PR #146):
- **Sentry error tracking** (#144) — `@sentry/node` v10, `Sentry.init` in `apps/api/src/instrument.ts`, `captureException` on unhandled + 5xx.
- **Android bundle ID rename** (#145) — `com.tootiye.teka` / `com.tootiye.tekaseller`.
- **Profile management** (PRs #138–#143).

## In-flight PRs

None yet — this branch will become a PR shortly.

## In-flight local branches

- `feat/sentry-prep-workflow-test-runbook` — current branch, this initiative.

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
