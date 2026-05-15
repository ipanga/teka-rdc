-- Buyer WhatsApp OTP authentication refactor (2026-05-15).
--
-- Reverses the buyer half of the 2026-05-12 email-auth cutover. Buyers now
-- authenticate with a WhatsApp OTP delivered by Gupshup; sellers and admins
-- keep email+password.
--
-- Changes:
--   1. Restore the `otps` and `otp_rate_limits` tables that were dropped on
--      2026-05-12. `code` stores sha256(otp) — never plaintext.
--   2. Extend `buyer_migrations` with two columns:
--        - `tempPhone`     — stashes the phone an email-only buyer is
--          claiming via /reclamer-compte, set after WhatsApp OTP verification
--          but before commit to `users.phone`.
--        - `claimEmailSent` — timestamp of the last claim-email send.
--
-- Idempotent: re-running after a successful apply is a no-op.
--
-- Run on the VPS via:
--   bash scripts/run-prod-sql.sh apps/api/prisma/migrations/manual/2026-05-15_whatsapp_otp_buyer.sql

BEGIN;

-- 1. Restore OTP storage tables.
CREATE TABLE IF NOT EXISTS otps (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text         NOT NULL,
  code        text         NOT NULL, -- sha256 hex of the 6-digit OTP
  attempts    integer      NOT NULL DEFAULT 0,
  "expiresAt" timestamp(3) NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS otps_phone_idx     ON otps(phone);
CREATE INDEX IF NOT EXISTS "otps_expiresAt_idx" ON otps("expiresAt");

CREATE TABLE IF NOT EXISTS otp_rate_limits (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text         NOT NULL,
  count       integer      NOT NULL DEFAULT 1,
  "expiresAt" timestamp(3) NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS otp_rate_limits_phone_idx     ON otp_rate_limits(phone);
CREATE INDEX IF NOT EXISTS "otp_rate_limits_expiresAt_idx" ON otp_rate_limits("expiresAt");

-- 2. Extend buyer_migrations for the email-only claim flow.
ALTER TABLE buyer_migrations
  ADD COLUMN IF NOT EXISTS "tempPhone"      text,
  ADD COLUMN IF NOT EXISTS "claimEmailSent" timestamp(3);

COMMIT;
