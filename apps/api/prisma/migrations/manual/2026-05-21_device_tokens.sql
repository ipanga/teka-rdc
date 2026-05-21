-- Push notification token registration (PR A, 2026-05-21).
--
-- Run on prod via:
--   docker compose -f docker-compose.prod.yml exec api \
--     sh -c 'psql "$DATABASE_URL" -f /app/prisma/migrations/manual/2026-05-21_device_tokens.sql'
--
-- Idempotent: IF NOT EXISTS guards on table + indexes. Safe to re-run.

CREATE TABLE IF NOT EXISTS "device_tokens" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"     UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token"      TEXT NOT NULL UNIQUE,
  "platform"   TEXT NOT NULL,
  "deviceInfo" TEXT,
  "appVersion" TEXT,
  "isActive"   BOOLEAN NOT NULL DEFAULT TRUE,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "device_tokens_userId_idx"
  ON "device_tokens"("userId");
CREATE INDEX IF NOT EXISTS "device_tokens_userId_isActive_idx"
  ON "device_tokens"("userId", "isActive");
