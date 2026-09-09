-- payoutMethodChangedAt (2026-09-09) — initiative docs/pre-scale-readiness.md, S12
-- (security/payout-destination-reauth).
--
-- ADDITIVE and IDEMPOTENT (expand phase, listed in auto-apply.list). One
-- nullable column: old code never reads it, so applying it before the rolling
-- swap changes no behaviour. NULL for every existing seller on purpose — a
-- destination saved before this release is treated as settled (no fabricated
-- change timestamp, no cooling-off imposed retroactively). The new code stamps
-- it on every destination change and refuses payout requests for 24 h after.
--
-- Rollback: not required to run the previous release (which never referenced
-- the column); ALTER TABLE "seller_profiles" DROP COLUMN "payoutMethodChangedAt"
-- would be the contract step if ever needed.

ALTER TABLE "seller_profiles"
  ADD COLUMN IF NOT EXISTS "payoutMethodChangedAt" TIMESTAMP(3);
