-- Admin in-app notification feed (2026-06-18).
-- Surfaces a dashboard alert/bell when a seller submits a product for review
-- (and is the substrate for future admin notification types).
--
-- Run on prod via:
--   docker compose -f docker-compose.prod.yml exec api \
--     sh -c 'psql "$DATABASE_URL" -f /app/prisma/migrations/manual/2026-06-18_admin_notifications.sql'
--
-- Idempotent: enum-create guarded, IF NOT EXISTS on table + indexes. Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdminNotificationType') THEN
    CREATE TYPE "AdminNotificationType" AS ENUM ('PRODUCT_SUBMITTED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "admin_notifications" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "type"       "AdminNotificationType" NOT NULL,
  "title"      TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "entityType" TEXT,
  "entityId"   TEXT,
  "readAt"     TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "admin_notifications_readAt_idx"
  ON "admin_notifications"("readAt");
CREATE INDEX IF NOT EXISTS "admin_notifications_createdAt_idx"
  ON "admin_notifications"("createdAt");
