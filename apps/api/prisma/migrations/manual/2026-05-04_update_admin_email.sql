-- Update the seeded admin user's email from admin@teka.cd to contact@teka.cd.
--
-- Idempotent:
--   - Skips if no admin user with email = 'admin@teka.cd' exists.
--   - Skips if any user (admin or otherwise) already holds the target email,
--     to avoid violating the unique constraint on users.email.
--   - Re-running after a successful update is a no-op.
--
-- Run on the VPS via:
--   bash scripts/run-prod-sql.sh apps/api/prisma/migrations/manual/2026-05-04_update_admin_email.sql

BEGIN;

DO $$
DECLARE
  admin_id text;
  conflict_id text;
BEGIN
  SELECT id INTO admin_id
  FROM users
  WHERE email = 'admin@teka.cd' AND role = 'ADMIN'
  LIMIT 1;

  IF admin_id IS NULL THEN
    RAISE NOTICE 'Skipped: no ADMIN user with email admin@teka.cd';
    RETURN;
  END IF;

  SELECT id INTO conflict_id
  FROM users
  WHERE email = 'contact@teka.cd'
  LIMIT 1;

  IF conflict_id IS NOT NULL AND conflict_id <> admin_id THEN
    RAISE EXCEPTION
      'Cannot update: contact@teka.cd already belongs to user %. Resolve manually.',
      conflict_id;
  END IF;

  UPDATE users
  SET email = 'contact@teka.cd',
      "updatedAt" = NOW()
  WHERE id = admin_id;

  RAISE NOTICE 'Updated admin email: admin@teka.cd → contact@teka.cd (user %)', admin_id;
END $$;

COMMIT;
