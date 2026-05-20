-- Phase 7a: notification preferences (opt-out for SMS order updates + broadcasts)
--
-- Adds a nullable JSONB column on `users` to store per-user notification
-- preferences. NULL means "all on" (backward compatible with existing rows).
--
-- Schema documented in apps/api/src/users/dto/notification-prefs.dto.ts:
--   { smsOrderUpdates?: boolean, smsBroadcasts?: boolean }
--
-- Transactional sends (OTP, password reset, email verify) are NOT
-- opt-out-able and ignore this column.
--
-- Apply on prod:
--   psql "$DATABASE_URL" -f apps/api/prisma/migrations/manual/2026-05-20_user_notification_prefs.sql
-- or via a Prisma client one-liner:
--   docker compose -f docker-compose.prod.yml exec api npx prisma db push --skip-generate
-- (db push will sync the schema.prisma change without writing a migration file)

ALTER TABLE users ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB;
