-- 2026-07-04 — Fix multi-seller checkout 500.
--
-- A single checkout uses one idempotencyKey but fans out to one Order per
-- seller in the cart (each Order row carries the same key). The old GLOBAL
-- unique constraint on orders.idempotencyKey therefore made ANY multi-seller
-- checkout fail on the 2nd order.create with
--   "Unique constraint failed on the fields: (idempotencyKey)".
--
-- Replace it with a composite unique (idempotencyKey, sellerId): still blocks a
-- true duplicate submit (same key + same seller) and preserves idempotent
-- retries, while allowing the legitimate per-seller fan-out. NULL keys stay
-- distinct in Postgres, so legacy/no-key orders are unaffected.
--
-- Idempotent: drops the old constraint/index if present, creates the new unique
-- index only if absent. Safe to re-run.

-- 1) Drop the old single-column unique (Prisma named it "orders_idempotencyKey_key";
--    it is a CONSTRAINT backed by an index — cover both spellings defensively).
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_idempotencyKey_key";
DROP INDEX IF EXISTS "orders_idempotencyKey_key";

-- 2) Add the composite unique (matches Prisma @@unique([idempotencyKey, sellerId])).
CREATE UNIQUE INDEX IF NOT EXISTS "orders_idempotencyKey_sellerId_key"
  ON "orders" ("idempotencyKey", "sellerId");
