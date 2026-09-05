-- Commune.isActive (2026-09-05) — initiative docs/seller-commune-verification.md, PR 1.
--
-- ADDITIVE and IDEMPOTENT (expand phase, listed in auto-apply.list). Old code
-- never reads the column; every existing commune stays active (DEFAULT TRUE),
-- so no public picker, seller profile or address changes behaviour on apply.
--
-- Why: retiring a commune is currently a hard DELETE whose FK (ON DELETE SET
-- NULL) silently erases the location of every seller and address in it. With
-- the flag, admins deactivate instead: the commune disappears from the pickers
-- and is refused by the resolver for NEW selections, while existing rows keep
-- their reference.
--
-- Rollback: ALTER TABLE "communes" DROP COLUMN "isActive"; not required to run
-- the previous release.

ALTER TABLE "communes"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS "communes_cityId_isActive_idx"
  ON "communes"("cityId", "isActive");
