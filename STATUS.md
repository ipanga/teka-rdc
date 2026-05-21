# Status — 2026-05-21

> **What this file is.** A single, hand-edited snapshot of *what is in-flight RIGHT NOW*. Read it first on every resume — before `CLAUDE.md`, before `PROGRESS.md`. When `## Active initiative` gets long, move its contents into `PROGRESS.md` history and reset this file.
>
> **Update rule.** Touch this file in the same commit that starts or ends an initiative. No drift window.

## Active initiative

**None.**

Last shipped: **profile management** (PRs #138–#143, 2026-05-20 → 2026-05-21) — notification preferences (Phase 7a), session management (Phase 7b), and the trust-proxy follow-up that made `req.ip` return the real client IP instead of the nginx docker address.

## In-flight PRs

None.

## In-flight local branches

None.

## Next candidates

Surfaced by a 2026-05-21 code-rot audit. Not yet committed to any of them — pick one when starting the next initiative.

| # | Candidate | Effort | Why |
|---|---|---|---|
| 1 | **Wire Sentry error capture** in `apps/api/src/common/filters/http-exception.filter.ts` (line ~58) | S | TODO stub since launch. 5+ months in prod with no centralized error monitoring. |
| 2 | **Real popularity metric** for `GET /v1/browse/products?sort=popularity` (currently falls back to `createdAt desc` per browse.service.ts line ~169) | M | UX gap — buyers see only newest, no real "best-selling" or "trending" surface. Requires a schema column + a sales/views-weighted score + a backfill. |
| 3 | Mark `AuthProvider.GOOGLE` + retired `PHONE_OTP` paths as `@deprecated` in `packages/shared/src/types/auth.ts` and `constants/auth.ts` | M | Dead enum members still type-allowed. Add JSDoc `@deprecated`, plan removal for Q3. |
| 4 | Move retired-endpoint e2e tests (`/v1/auth/otp/*`, seller migration) to `deprecated-e2e.spec.ts` with skip tag | M | Tests pass but the routes 404 in prod — false confidence. |
| 5 | Bulk Flutter `InputDecoration` border modernization across both mobile apps (16 occurrences) | S | Not broken — just lagging current Material 3 idiom. |

## Recently archived plans

- `~/.claude/plans/archive/partitioned-nibbling-spark.shipped.md` — Rakuten redesign, executed in PRs #67–#73 (2026-05-XX). **Do not re-execute.** Moved out of the live plans dir into `archive/` on 2026-05-21 after almost being re-implemented from scratch in a fresh session. Any plan file in `~/.claude/plans/archive/` with a `.shipped.md` suffix is historical — read for context only.

> **Other untouched files in `~/.claude/plans/`** (e.g. `calm-soaring-emerson.md`, `fix-ios-push-mighty-nebula.md`, etc.) have unknown status. They are not necessarily in-flight — cross-reference each against git log + this file before treating one as a backlog item.
