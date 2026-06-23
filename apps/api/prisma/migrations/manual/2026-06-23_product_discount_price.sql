-- 2026-06-23 — Per-product seller-set discount price.
--
-- Adds an optional promotional price to products (effective/charged price =
-- discountPriceCDF ?? priceCDF; the % is derived on display, never stored) and
-- the original-price snapshot to order_items so historical orders keep accurate
-- list-vs-paid reporting. All columns nullable → no backfill; legacy rows read
-- as "no discount". Distinct from the admin Promotion/flash-deal model.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS. Safe to
-- re-run. Does NOT touch the FTS search_vector generated column.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "discountPriceCDF" BIGINT,
  ADD COLUMN IF NOT EXISTS "discountPriceUSD" BIGINT;

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "listUnitPriceCDF" BIGINT,
  ADD COLUMN IF NOT EXISTS "listUnitPriceUSD" BIGINT;

CREATE INDEX IF NOT EXISTS "products_discountPriceCDF_idx"
  ON "products" ("discountPriceCDF");
