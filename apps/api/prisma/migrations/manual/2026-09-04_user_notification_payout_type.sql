-- Seller payout notifications in the in-app feed (2026-09-04) — initiative
-- docs/payouts-commission-action-center.md, PR 6.
--
-- Adds the PAYOUT value to the UserNotificationType enum so payout
-- approved / paid / rejected events get a durable feed row (entityType
-- 'payout', entityId = payout id) next to the existing push + email.
--
-- EXPAND-only and idempotent (ADD VALUE IF NOT EXISTS). Old code never writes
-- the value; installed mobile builds render an unknown type with the default
-- icon (verified: `default:` branches in both feed screens).
--
-- ADD VALUE must run outside an explicit transaction — keep it a top-level
-- statement (apply-auto.sh runs `psql -f`, no --single-transaction).
--
-- Rollback: not needed for correctness (the value is only ever appended);
-- removing an enum value in PostgreSQL requires recreating the type.

ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'PAYOUT';
