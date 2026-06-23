-- 2026-06-23 — Broadcast notifications: persist a per-recipient in-app feed +
-- specific-buyer / product-linked broadcasts.
--
-- Extends the existing UserNotification (generic, user-scoped feed) with two
-- broadcast types, and the NotificationBroadcast row with an optional linked
-- product + explicit recipient ids (specific-buyer audit). Fan-out-on-write:
-- the send loop creates one UserNotification per recipient.
--
-- Idempotent: ADD VALUE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS. Safe to
-- re-run. No backfill (new columns nullable; new enum values unused on legacy
-- rows). Does NOT touch the FTS search_vector generated column.

-- New buyer-facing notification types.
ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'BROADCAST';
ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'PRODUCT_PROMO';

-- Broadcast: optional linked product + explicit recipient ids.
ALTER TABLE "notification_broadcasts"
  ADD COLUMN IF NOT EXISTS "productId" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientIds" JSONB;
