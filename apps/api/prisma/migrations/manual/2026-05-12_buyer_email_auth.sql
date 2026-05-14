-- Buyer email/password authentication refactor (2026-05-12).
--
-- Changes:
--   1. users.phone becomes nullable (was NOT NULL UNIQUE).
--      Postgres treats NULLs as distinct under the existing unique index,
--      so the constraint continues to hold for legacy phone-based buyers.
--   2. Adds buyer_migrations table — parallel to seller_migrations — to
--      record the email-setup lifecycle for legacy PHONE_OTP buyers
--      migrating to EMAIL_PASSWORD.
--
-- Notes on the OTP tables (otps, otp_rate_limits):
--   They are dropped by Prisma `db push` when the corresponding `model Otp` /
--   `model OtpRateLimit` definitions are removed from schema.prisma in the
--   same commit. Do NOT add explicit DROP TABLE statements here — Prisma's
--   db-push diff handles them and emits a confirmation prompt the operator
--   can review. If running raw SQL instead of db push, append:
--       DROP TABLE IF EXISTS otp_rate_limits;
--       DROP TABLE IF EXISTS otps;
--
-- Idempotent: re-running after a successful apply is a no-op.
--
-- Run on the VPS via:
--   bash scripts/run-prod-sql.sh apps/api/prisma/migrations/manual/2026-05-12_buyer_email_auth.sql

BEGIN;

-- 1. Relax the NOT NULL constraint on users.phone.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'users'
      AND column_name  = 'phone'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
    RAISE NOTICE 'users.phone is now NULLABLE';
  ELSE
    RAISE NOTICE 'Skipped: users.phone is already NULLABLE';
  END IF;
END $$;

-- 2. Create buyer_migrations table if it does not exist.
CREATE TABLE IF NOT EXISTS buyer_migrations (
  "userId"         uuid        PRIMARY KEY,
  "setupEmailSent" timestamp(3),
  "setupCompleted" timestamp(3),
  "tempEmail"      text,
  "createdAt"      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT buyer_migrations_user_fkey
    FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
);

COMMIT;
