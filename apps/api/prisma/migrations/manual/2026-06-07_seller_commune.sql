-- Add commune to seller applications (2026-06-07, QA-1).
--
-- The seller application form gained a required Commune field (filtered by the
-- chosen Ville). SellerProfile already had cityId; this adds the matching
-- communeId + FK to the existing communes table. Column is NULLABLE so existing
-- seller rows (e.g. "Teka RDC Officiel") stay valid — the field is enforced as
-- required at the DTO/form layer for new applications, not in the DB.
--
-- Run on prod via the "Apply prod migration" GitHub Action.
--
-- Idempotent: IF NOT EXISTS guards on the column + index, and a catalog check
-- before adding the FK constraint. Safe to re-run.

ALTER TABLE "seller_profiles"
  ADD COLUMN IF NOT EXISTS "communeId" UUID;

CREATE INDEX IF NOT EXISTS "seller_profiles_communeId_idx"
  ON "seller_profiles" ("communeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seller_profiles_communeId_fkey'
  ) THEN
    ALTER TABLE "seller_profiles"
      ADD CONSTRAINT "seller_profiles_communeId_fkey"
      FOREIGN KEY ("communeId") REFERENCES "communes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
