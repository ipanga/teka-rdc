-- Per-user in-app notification feed (2026-06-18).
-- Backs seller product-approval/rejection notifications (and is reusable for
-- buyers later). Distinct from the global admin_notifications inbox.
--
-- Run on prod via:
--   docker compose -f docker-compose.prod.yml exec api \
--     sh -c 'psql "$DATABASE_URL" -f /app/prisma/migrations/manual/2026-06-18_user_notifications.sql'
--
-- Idempotent: enum-create guarded, IF NOT EXISTS on table + indexes. Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserNotificationType') THEN
    CREATE TYPE "UserNotificationType" AS ENUM ('PRODUCT_APPROVED', 'PRODUCT_REJECTED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "user_notifications" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"     UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type"       "UserNotificationType" NOT NULL,
  "title"      TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "entityType" TEXT,
  "entityId"   TEXT,
  "readAt"     TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "user_notifications_userId_readAt_idx"
  ON "user_notifications"("userId", "readAt");
CREATE INDEX IF NOT EXISTS "user_notifications_userId_createdAt_idx"
  ON "user_notifications"("userId", "createdAt");
