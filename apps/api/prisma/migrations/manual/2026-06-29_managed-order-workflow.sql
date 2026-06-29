-- Managed Order Workflow: Teka-collection states, delivery/return timestamps,
-- and the buyer return-request table.
-- Idempotent. Apply via the "Apply prod migration" GitHub Action.

-- 1) Two new OrderStatus values for the Teka-managed lifecycle:
--    READY_FOR_TEKA_PICKUP (seller handed the parcel off) and RECEIVED_AT_TEKA
--    (Teka warehouse confirmed intake). ADD VALUE IF NOT EXISTS is idempotent;
--    must run outside a txn block in some PG versions — the apply-migration
--    action runs the file directly through psql (autocommit), so this is safe.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_TEKA_PICKUP';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RECEIVED_AT_TEKA';

-- 2) ReturnStatus enum for buyer return requests.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReturnStatus') THEN
    CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');
  END IF;
END $$;

-- 3) Order timestamps that anchor the return window + payout eligibility.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveredAt" timestamptz;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "returnedAt"  timestamptz;

-- 4) Buyer return requests (admin-reviewed). buyerId / reviewedById are plain
--    uuid columns (no FK to users) — mirrors orders.cancelledBy.
CREATE TABLE IF NOT EXISTS "return_requests" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "orderId"      uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "buyerId"      uuid NOT NULL,
  "reason"       text NOT NULL,
  "status"       "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
  "reviewedById" uuid,
  "reviewedAt"   timestamptz,
  "reviewNote"   text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),
  "deletedAt"    timestamptz
);
CREATE INDEX IF NOT EXISTS "return_requests_orderId_idx"   ON "return_requests" ("orderId");
CREATE INDEX IF NOT EXISTS "return_requests_buyerId_idx"   ON "return_requests" ("buyerId");
CREATE INDEX IF NOT EXISTS "return_requests_status_idx"    ON "return_requests" ("status");
CREATE INDEX IF NOT EXISTS "return_requests_createdAt_idx" ON "return_requests" ("createdAt");
