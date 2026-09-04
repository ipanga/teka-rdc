-- Payout / commission ledger foundation (2026-09-04) — initiative
-- docs/payouts-commission-action-center.md, PR 2.
--
-- ADDITIVE and IDEMPOTENT (expand phase, listed in auto-apply.list). Old code
-- tolerates every change: new columns are nullable, the new table is unread
-- by it, and the partial unique index only constrains a situation the old
-- code already treats as a 409 (one open payout per seller).
--
-- What it adds:
--   1. enum CommissionSource (SELLER | CATEGORY | GLOBAL | MIXED)
--   2. seller_profiles.commissionRate       — per-seller override, NULL = default
--   3. order_items.commission*              — per-line rate/amount/rule snapshot at delivery
--   4. seller_earnings.commissionSource / reversedAt / reversalReason / clawbackRequiredAt
--      — auditable reversal instead of DELETE (rows are never deleted any more)
--   5. payouts.processingAt/By, completedById, rejectedAt/By — transition actors
--   6. admin_audit_logs                     — who changed what, when, before/after
--   7. payouts_one_open_per_seller          — partial unique index: at most one
--      REQUESTED/APPROVED/PROCESSING payout per seller (defence in depth behind
--      the row lock the API takes)
--   8. a GLOBAL commission setting of 10 % ONLY IF none exists. This does not
--      change any figure: 10 % was already the code's hardcoded fallback when
--      no global row existed. The API now refuses to deliver an order without
--      a global setting rather than silently applying a constant.
--
-- No backfill of existing rows; historical earnings keep their persisted
-- rate/amount (commissionSource stays NULL = "rule unknown, pre-2026-09-04").
--
-- Rollback: DROP INDEX payouts_one_open_per_seller; DROP TABLE admin_audit_logs;
-- DROP the added columns; DROP TYPE "CommissionSource". None is required to
-- run the previous release.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommissionSource') THEN
    CREATE TYPE "CommissionSource" AS ENUM ('SELLER', 'CATEGORY', 'GLOBAL', 'MIXED');
  END IF;
END$$;

ALTER TABLE "seller_profiles"
  ADD COLUMN IF NOT EXISTS "commissionRate" DECIMAL(5,4);

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "commissionRate"   DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS "commissionCDF"    BIGINT,
  ADD COLUMN IF NOT EXISTS "commissionSource" "CommissionSource",
  ADD COLUMN IF NOT EXISTS "commissionRuleId" UUID;

ALTER TABLE "seller_earnings"
  ADD COLUMN IF NOT EXISTS "commissionSource"   "CommissionSource",
  ADD COLUMN IF NOT EXISTS "reversedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reversalReason"     TEXT,
  ADD COLUMN IF NOT EXISTS "clawbackRequiredAt" TIMESTAMP(3);

ALTER TABLE "payouts"
  ADD COLUMN IF NOT EXISTS "processingAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "processingById" UUID,
  ADD COLUMN IF NOT EXISTS "completedById"  UUID,
  ADD COLUMN IF NOT EXISTS "rejectedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectedById"   UUID;

CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "actorId"    UUID NOT NULL,
  "action"     TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId"   TEXT NOT NULL,
  "before"     JSONB,
  "after"      JSONB,
  "reason"     TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "admin_audit_logs_entityType_entityId_idx"
  ON "admin_audit_logs"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_actorId_idx"
  ON "admin_audit_logs"("actorId");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_createdAt_idx"
  ON "admin_audit_logs"("createdAt");

-- One open payout per seller. Partial, so closed payouts never collide.
CREATE UNIQUE INDEX IF NOT EXISTS "payouts_one_open_per_seller"
  ON "payouts"("sellerProfileId")
  WHERE "status" IN ('REQUESTED', 'APPROVED', 'PROCESSING');

-- Guarantee a global commission setting (materialises the former hardcoded
-- 10 % fallback; a no-op wherever an admin already configured one).
INSERT INTO "commission_settings" ("id", "categoryId", "rate", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), NULL, 0.1000, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "commission_settings" WHERE "categoryId" IS NULL
);
