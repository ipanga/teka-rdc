-- Marketplace Taxonomy / Brands — schema foundation (2026-06-14, Phase 1).
--
-- Non-behavioural schema groundwork for the taxonomy + dynamic-attributes +
-- brand-library initiative. NO data is deleted here (the catalog reset is a
-- later phase). This migration:
--   1. Adds BOOLEAN to the AttributeType enum (new dynamic-attribute type).
--   2. Creates the first-class Brand library (`brands`) + the brand<->category
--      link table (`brand_categories`).
--   3. Adds `products.brandId` (nullable FK -> brands) + its index.
--   4. Hardens orphan-risk FKs so a future product hard-delete cascades cleanly:
--      cart_items / reviews / wishlists  productId  RESTRICT -> CASCADE.
--      (promotions.productId is already SET NULL; order_items.productId stays
--       RESTRICT on purpose — order history must survive product deletion.)
--
-- Run on prod via the "Apply prod migration" GitHub Action.
--
-- Idempotent: ADD VALUE IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, ADD COLUMN
-- IF NOT EXISTS, DROP CONSTRAINT IF EXISTS before re-adding. Safe to re-run.

-- 1. New attribute type ------------------------------------------------------
-- ADD VALUE IF NOT EXISTS must run outside an explicit transaction and cannot
-- be used in the same tx that consumes it; this file does neither.
ALTER TYPE "AttributeType" ADD VALUE IF NOT EXISTS 'BOOLEAN';

-- 2. Brand library -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "brands" (
  "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
  "name"      TEXT         NOT NULL,
  "slug"      TEXT         NOT NULL,
  "logoUrl"   TEXT,
  "isActive"  BOOLEAN      NOT NULL DEFAULT true,
  "sortOrder" INTEGER      NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "brands_name_key"      ON "brands" ("name");
CREATE UNIQUE INDEX IF NOT EXISTS "brands_slug_key"      ON "brands" ("slug");
CREATE INDEX        IF NOT EXISTS "brands_isActive_idx"  ON "brands" ("isActive");
CREATE INDEX        IF NOT EXISTS "brands_sortOrder_idx" ON "brands" ("sortOrder");
CREATE INDEX        IF NOT EXISTS "brands_deletedAt_idx" ON "brands" ("deletedAt");

-- 3. Brand <-> Category link (which brands are offered per subcategory) -------
CREATE TABLE IF NOT EXISTS "brand_categories" (
  "brandId"    UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  CONSTRAINT "brand_categories_pkey" PRIMARY KEY ("brandId", "categoryId")
);

CREATE INDEX IF NOT EXISTS "brand_categories_categoryId_idx"
  ON "brand_categories" ("categoryId");

ALTER TABLE "brand_categories" DROP CONSTRAINT IF EXISTS "brand_categories_brandId_fkey";
ALTER TABLE "brand_categories" ADD  CONSTRAINT "brand_categories_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "brands"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "brand_categories" DROP CONSTRAINT IF EXISTS "brand_categories_categoryId_fkey";
ALTER TABLE "brand_categories" ADD  CONSTRAINT "brand_categories_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. products.brandId --------------------------------------------------------
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brandId" UUID;

CREATE INDEX IF NOT EXISTS "products_brandId_idx" ON "products" ("brandId");

ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_brandId_fkey";
ALTER TABLE "products" ADD  CONSTRAINT "products_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "brands"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Harden orphan-risk FKs for clean cascade on product hard-delete ----------
-- RESTRICT -> CASCADE so deleting a product removes its cart lines / reviews /
-- wishlist entries instead of blocking the delete.
ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "cart_items_productId_fkey";
ALTER TABLE "cart_items" ADD  CONSTRAINT "cart_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_productId_fkey";
ALTER TABLE "reviews" ADD  CONSTRAINT "reviews_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wishlists" DROP CONSTRAINT IF EXISTS "wishlists_productId_fkey";
ALTER TABLE "wishlists" ADD  CONSTRAINT "wishlists_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
