-- Product lifecycle: SUSPENDED status + ProductStatusLog audit trail.
-- Idempotent. Apply via the "Apply prod migration" GitHub Action.

-- 1) New ProductStatus value: SUSPENDED (admin takedown of a published product).
--    ADD VALUE IF NOT EXISTS is idempotent + non-blocking. Must run outside a
--    txn block in some PG versions; the apply-migration action runs it directly.
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';

-- 2) Durable status-transition audit log (mirrors order_status_logs).
CREATE TABLE IF NOT EXISTS "product_status_logs" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId"  uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "fromStatus" "ProductStatus",
  "toStatus"   "ProductStatus" NOT NULL,
  "actorId"    uuid,
  "actorRole"  text NOT NULL,
  "reason"     text,
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "product_status_logs_productId_createdAt_idx"
  ON "product_status_logs" ("productId", "createdAt");
