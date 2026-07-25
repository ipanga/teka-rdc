-- Account deletion — 30-day pending-deletion grace period.
--
-- Adds the two nullable timestamps that drive the pending-deletion flow, plus an
-- index the daily purge job scans. `deletedAt` (already present) stays the
-- terminal anonymized state.
--
-- SAFE + idempotent: additive nullable columns + index, all guarded with
-- IF NOT EXISTS. No backfill, no data change for existing rows.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletionScheduledAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "users_deletionScheduledAt_idx"
  ON "users" ("deletionScheduledAt");
