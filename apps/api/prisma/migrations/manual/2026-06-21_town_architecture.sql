-- Town Architecture Refactor / P0 (2026-06-21)
-- 1. Data-driven town identity on cities so future towns are config-only
--    (no hardcoded slug -> accent/hero switches in app code):
--      accentColor  — accent key ('copper' | 'cobalt' | hex) for the town badge/chips
--      heroImageUrl — town hero/landing image URL (null -> default)
-- 2. Preferred delivery town on users so an authenticated buyer's town choice
--    follows them across devices (hydrated on login).
-- All additive + idempotent. No backfill required (NULLs are valid: accent/hero
-- fall back to brand-red + default hero; preferredCityId null = never chosen).

ALTER TABLE "cities" ADD COLUMN IF NOT EXISTS "accentColor" TEXT;
ALTER TABLE "cities" ADD COLUMN IF NOT EXISTS "heroImageUrl" TEXT;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferredCityId" UUID;

-- FK to cities (guarded so re-runs don't error on the existing constraint).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_preferredCityId_fkey'
      AND table_name = 'users'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_preferredCityId_fkey"
      FOREIGN KEY ("preferredCityId") REFERENCES "cities"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "users_preferredCityId_idx" ON "users" ("preferredCityId");
