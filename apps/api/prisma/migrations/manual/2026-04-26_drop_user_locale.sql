-- Drop the User.locale column.
--
-- After the monolingual refactor, the platform is FR-only and there's
-- nothing to switch between. The column was unused by any service.
--
-- Idempotent: skips silently if the column is already gone.
--
-- Run on the VPS via:
--   bash scripts/run-prod-sql.sh apps/api/prisma/migrations/manual/2026-04-26_drop_user_locale.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'locale'
  ) THEN
    ALTER TABLE users DROP COLUMN locale;
    RAISE NOTICE 'Dropped users.locale';
  ELSE
    RAISE NOTICE 'Skipped users.locale (already absent)';
  END IF;
END $$;

COMMIT;
