-- City-first URL refactor (2026-06-06) — schema + backfill.
--
-- Moves the city out of product slugs and into the URL path. Adds:
--   * products.shortCode  — short, UNIQUE resolver code = the URL tail
--                           `/{ville}/{slug}-{shortCode}`.
--   * cities.slug         — UNIQUE `{ville}` URL segment (e.g. "lubumbashi").
-- and makes products.slug NON-unique (it is now cosmetic; two products may
-- share a clean slug, disambiguated by shortCode).
--
-- Backfill is deterministic and matches prisma/seed.ts exactly:
--   shortCode = substring(md5(id::text), 1, 6)      (Postgres core md5)
--   city slug = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), trimmed
-- so a later `db:seed` run computes identical values and never churns URLs.
--
-- Run on prod via the "Apply prod migration" GitHub Action.
-- Idempotent: IF [NOT] EXISTS guards throughout. Safe to re-run.

-- 1. New columns (nullable first, so the add never blocks on existing rows).
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "shortCode" TEXT;
ALTER TABLE "cities"   ADD COLUMN IF NOT EXISTS "slug"      TEXT;

-- 2. Backfill city slugs from name. DRC city names are ASCII (the only hyphen,
--    "Mbuji-Mayi", maps cleanly). Only fill NULLs so re-runs are stable.
UPDATE "cities"
   SET "slug" = trim(BOTH '-' FROM regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'))
 WHERE "slug" IS NULL;

-- 3. Backfill product shortCodes deterministically (md5 prefix of the UUID).
--    Matches seed.ts shortCodeFromId(). Only fill NULLs.
UPDATE "products"
   SET "shortCode" = substring(md5("id"::text) FROM 1 FOR 6)
 WHERE "shortCode" IS NULL;

-- 4. products.slug is no longer unique — drop the unique constraint/index that
--    Prisma created for `@unique` (named "products_slug_key"). Keep the plain
--    lookup index "products_slug_idx" (from @@index([slug])).
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_slug_key";
DROP INDEX IF EXISTS "products_slug_key";

-- 5. Uniqueness + lookup indexes for the new columns.
CREATE UNIQUE INDEX IF NOT EXISTS "products_shortCode_key" ON "products" ("shortCode");
CREATE INDEX        IF NOT EXISTS "products_shortCode_idx" ON "products" ("shortCode");
CREATE UNIQUE INDEX IF NOT EXISTS "cities_slug_key"        ON "cities"   ("slug");
CREATE INDEX        IF NOT EXISTS "cities_slug_idx"        ON "cities"   ("slug");

-- NOTE: existing product rows keep their OLD city-embedded slug values until a
-- `db:seed` run rewrites them to clean slugs. That is fine — products resolve
-- by shortCode (and the legacy slug still resolves via the slug fallback in
-- BrowseService.getProductDetail), so no URL 404s during the window.
