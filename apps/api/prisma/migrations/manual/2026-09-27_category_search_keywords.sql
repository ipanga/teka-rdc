-- Seller Catalogue Speed-up (2026-09-27) — category search aliases.
--
-- WHY: sellers search the category picker with the words they use on the
-- shelf — a brand (« omo »), a colloquial name (« savon poudre ») or an
-- unaccented spelling. Those terms are not category names and must never be
-- shown to buyers, so they live in their own column, read only by the
-- category-search index (GET /v1/browse/categories/search) and the admin
-- category editor. Distinct from `search_synonyms`, which expands PRODUCT text
-- search and has no category relation.
--
-- SHAPE: one additive column, empty by default.
--
-- ADDITIVE + IDEMPOTENT: ADD COLUMN IF NOT EXISTS with a constant default is a
-- metadata-only change in PostgreSQL 11+ (no table rewrite). The previous
-- release's code never selects the column, so this is safe to apply BEFORE the
-- rolling swap (auto-apply.list).

ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "searchKeywords" TEXT[] NOT NULL DEFAULT '{}';

-- ROLLBACK (manual, only after the code that reads it is rolled back):
-- ALTER TABLE "categories" DROP COLUMN IF EXISTS "searchKeywords";
