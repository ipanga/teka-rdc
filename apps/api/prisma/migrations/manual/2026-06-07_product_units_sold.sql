-- Best-seller counter (2026-06-07, Initiative #2 Phase A).
--
-- Adds Product.unitsSold (total units from DELIVERED orders) to power a real
-- `popularity` sort + "X vendus" social proof. Incremented at runtime in
-- deliverOrder; this migration backfills from existing delivered orders.
--
-- Run on prod via the "Apply prod migration" GitHub Action.
--
-- Idempotent: IF NOT EXISTS guards + the backfill recomputes from source.
-- Safe to re-run.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "unitsSold" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "products_unitsSold_idx" ON "products" ("unitsSold");

-- Backfill: sum of delivered units per product.
UPDATE "products" p
  SET "unitsSold" = COALESCE((
    SELECT SUM(oi."quantity")
    FROM "order_items" oi
    JOIN "orders" o ON oi."orderId" = o."id"
    WHERE oi."productId" = p."id" AND o."status" = 'DELIVERED'
  ), 0);
