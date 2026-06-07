-- Product full-text search (2026-06-07, Initiative #2 Phase B / P-B1).
--
-- Replaces the relevance-free `ILIKE '%q%'` search with Postgres FTS:
--   - a STORED generated tsvector over title+description (French config),
--     GIN-indexed → relevance ranking via ts_rank, fast at scale;
--   - pg_trgm + a trigram GIN index on title → typo tolerance (similarity).
-- The browse search path ranks by ts_rank + trigram similarity (real-above-demo
-- first), via raw SQL ($queryRaw), since Prisma can't order by ts_rank.
--
-- Run on prod via the "Apply prod migration" GitHub Action.
--
-- Idempotent: extension/column/index IF NOT EXISTS. Safe to re-run.
-- (to_tsvector with a constant regconfig is IMMUTABLE, so the generated column
-- is permitted.)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'french',
      coalesce("title", '') || ' ' || coalesce("description", '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS "products_search_vector_idx"
  ON "products" USING GIN ("search_vector");

CREATE INDEX IF NOT EXISTS "products_title_trgm_idx"
  ON "products" USING GIN ("title" gin_trgm_ops);
