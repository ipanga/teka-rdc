-- Mark the seeded demo catalog (2026-06-07, Phase 3 / P3a).
--
-- Adds Product.isDemo so real merchant products can be ranked above the seeded
-- "Teka RDC Officiel" demo catalog (and, later, retired per-category). Real
-- products default false; the backfill flags the demo seller's existing rows.
--
-- Run on prod via the "Apply prod migration" GitHub Action.
--
-- Idempotent: IF NOT EXISTS guards + an idempotent UPDATE. Safe to re-run.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "products_isDemo_idx" ON "products" ("isDemo");

-- Backfill: every product owned by the platform demo seller (Teka RDC Officiel,
-- canonical user id 10000000-…-999999) is demo content.
UPDATE "products"
  SET "isDemo" = true
  WHERE "sellerId" = '10000000-0000-0000-0000-000000999999';
