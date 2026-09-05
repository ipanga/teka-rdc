-- Seller verification domain + private official documents (2026-09-05) —
-- initiative docs/seller-commune-verification.md, PR 2 (decisions D1–D8).
--
-- ADDITIVE and IDEMPOTENT (expand phase, listed in auto-apply.list). Old code
-- never reads the new columns/table/enum values; every existing seller gets
-- the truthful default NOT_SUBMITTED (no legacy seller is ever auto-verified,
-- the June KYC photo stays where it is). Nothing is dropped or backfilled.
--
-- What it adds:
--   1. enums SellerVerificationStatus / SellerDocumentType / SellerDocumentStatus
--   2. seller_profiles.verification* — separate lifecycle from applicationStatus
--   3. seller_documents — one row per uploaded official document; the binary
--      lives in Cloudinary as a private (authenticated) asset, never here
--   4. UserNotificationType.SELLER_VERIFICATION (feed rows for the lifecycle)
--
-- Locking: nullable ADD COLUMN / CREATE TABLE / CREATE INDEX only (no rewrite);
-- ADD VALUE must stay a top-level statement (apply-auto.sh runs `psql -f`,
-- no --single-transaction).
--
-- Rollback: DROP TABLE seller_documents; DROP the seller_profiles.verification*
-- columns; DROP the three types. Not required to run the previous release.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SellerVerificationStatus') THEN
    CREATE TYPE "SellerVerificationStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SellerDocumentType') THEN
    CREATE TYPE "SellerDocumentType" AS ENUM ('RCCM', 'IDENTIFICATION_NATIONALE', 'IDENTITY_DOCUMENT', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SellerDocumentStatus') THEN
    CREATE TYPE "SellerDocumentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');
  END IF;
END$$;

ALTER TABLE "seller_profiles"
  ADD COLUMN IF NOT EXISTS "verificationStatus"      "SellerVerificationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
  ADD COLUMN IF NOT EXISTS "verificationSubmittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verifiedAt"              TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verifiedById"            UUID,
  ADD COLUMN IF NOT EXISTS "verificationRejectedAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verificationRevokedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verificationNote"        TEXT;

CREATE INDEX IF NOT EXISTS "seller_profiles_verificationStatus_idx"
  ON "seller_profiles"("verificationStatus");

CREATE TABLE IF NOT EXISTS "seller_documents" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sellerProfileId" UUID NOT NULL REFERENCES "seller_profiles"("id"),
  "type"            "SellerDocumentType" NOT NULL,
  "label"           TEXT,
  "cloudinaryId"    TEXT NOT NULL,
  "resourceType"    TEXT NOT NULL,
  "mimeType"        TEXT NOT NULL,
  "sizeBytes"       INTEGER NOT NULL,
  "originalName"    TEXT,
  "status"          "SellerDocumentStatus" NOT NULL DEFAULT 'PENDING',
  "rejectionReason" TEXT,
  "submittedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadedAt"      TIMESTAMP(3),
  "reviewedAt"      TIMESTAMP(3),
  "reviewedById"    UUID,
  "supersededAt"    TIMESTAMP(3),
  "supersededById"  UUID,
  "purgeAfter"      TIMESTAMP(3),
  "purgedAt"        TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "seller_documents_cloudinaryId_key"
  ON "seller_documents"("cloudinaryId");
CREATE INDEX IF NOT EXISTS "seller_documents_sellerProfileId_type_status_idx"
  ON "seller_documents"("sellerProfileId", "type", "status");
CREATE INDEX IF NOT EXISTS "seller_documents_purgeAfter_purgedAt_idx"
  ON "seller_documents"("purgeAfter", "purgedAt");
CREATE INDEX IF NOT EXISTS "seller_documents_uploadedAt_idx"
  ON "seller_documents"("uploadedAt");

ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'SELLER_VERIFICATION';
