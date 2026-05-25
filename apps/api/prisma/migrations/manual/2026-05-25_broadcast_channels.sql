-- Per-broadcast channel selection (PR A3, 2026-05-25 — Orange/AT/Flexpay removal).
--
-- Adds a nullable JSONB column to notification_broadcasts so an admin can pick
-- which delivery channels a broadcast should use ({push, email, sms}). NULL
-- means "use the service-layer defaults" (today: push+email, no sms) — keeps
-- legacy rows valid without a backfill.
--
-- Run on prod via the "Apply prod migration" GitHub Action.
--
-- Idempotent: IF NOT EXISTS guard. Safe to re-run.

ALTER TABLE "notification_broadcasts"
  ADD COLUMN IF NOT EXISTS "channels" JSONB;
