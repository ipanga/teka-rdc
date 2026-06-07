-- Seller KYC document (2026-06-07, Phase 2 / P2a).
--
-- Stores the Cloudinary public_id of the seller's ID/RCCM photo (uploaded to a
-- PRIVATE folder) + when it was uploaded. No public URL is persisted — admins
-- view the document via a short-lived signed URL generated from the public_id.
-- Columns are NULLABLE so existing seller rows stay valid; the document is
-- enforced as required at the DTO/form layer for new applications.
--
-- Run on prod via the "Apply prod migration" GitHub Action.
--
-- Idempotent: IF NOT EXISTS guards. Safe to re-run.

ALTER TABLE "seller_profiles"
  ADD COLUMN IF NOT EXISTS "idDocumentCloudinaryId" TEXT;

ALTER TABLE "seller_profiles"
  ADD COLUMN IF NOT EXISTS "idDocumentUploadedAt" TIMESTAMP(3);
