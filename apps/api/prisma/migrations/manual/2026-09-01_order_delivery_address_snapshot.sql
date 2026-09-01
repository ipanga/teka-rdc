-- Order delivery-address snapshot
--
-- WHY. `orders.deliveryAddressId` is a bare FK. Buyers are moving to a single
-- editable address, so without a snapshot every address edit would retroactively
-- rewrite the delivery address of every past order pointing at that row.
-- Production already has 2 addresses each referenced by more than one order, so
-- this is not hypothetical. OrderItem already snapshots productTitle /
-- unitPriceCDF; the address was the odd one out.
--
-- SAFETY. Purely additive and idempotent:
--   * columns are nullable and guarded with IF NOT EXISTS, so the currently
--     running container keeps serving while this applies (auto-apply runs
--     BEFORE the rolling swap);
--   * the backfill only touches rows whose snapshot is still NULL, so re-running
--     is a no-op and it can never overwrite a snapshot already written by the
--     new code;
--   * nothing is dropped or renamed. `deliveryAddressId` stays for provenance.
--
-- Readers fall back to the Address relation when the snapshot is NULL
-- (resolveDeliveryAddress), which covers rows created during the deploy window.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryLabel"          TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryProvince"       TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryTown"           TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryNeighborhood"   TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryAvenue"         TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryReference"      TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryRecipientName"  TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryRecipientPhone" TEXT;

-- Backfill from the address each order currently points at. This is the best
-- available approximation of the address as it was at order time: it is exactly
-- what every read path returns today, so the snapshot changes no visible value —
-- it only freezes it against future edits.
UPDATE "orders" o
SET
  "deliveryLabel"          = a."label",
  "deliveryProvince"       = a."province",
  "deliveryTown"           = a."town",
  "deliveryNeighborhood"   = a."neighborhood",
  "deliveryAvenue"         = a."avenue",
  "deliveryReference"      = a."reference",
  "deliveryRecipientName"  = a."recipientName",
  "deliveryRecipientPhone" = a."recipientPhone"
FROM "addresses" a
WHERE a."id" = o."deliveryAddressId"
  AND o."deliveryTown" IS NULL;
