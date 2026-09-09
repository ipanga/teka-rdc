-- auth_rate_limits (2026-09-06) — initiative docs/pre-scale-readiness.md, D8 (security/auth-throttling).
--
-- ADDITIVE and IDEMPOTENT (expand phase, listed in auto-apply.list). New table
-- only: old code never reads it, so applying it before the rolling swap changes
-- no behaviour. The new code writes one row per (scope, identifier hash) —
-- the key never contains a raw phone number or email — and sweeps expired
-- rows hourly, so growth is bounded by the number of distinct identifiers seen
-- in a window.
--
-- Why: authentication throttling must be keyed on the identity under attack
-- (phone, email, session) and must hold across API containers and restarts;
-- the in-memory @nestjs/throttler state is per process and per IP only.
--
-- Rollback: DROP TABLE "auth_rate_limits"; not required to run the previous
-- release (which never referenced the table).

CREATE TABLE IF NOT EXISTS "auth_rate_limits" (
  "key"         TEXT PRIMARY KEY,
  "count"       INTEGER NOT NULL DEFAULT 1,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "lockedUntil" TIMESTAMP(3),
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "auth_rate_limits_expiresAt_idx"
  ON "auth_rate_limits"("expiresAt");
