-- Accent-insensitive search + word-level typo tolerance (2026-06-07,
-- Initiative #2 Phase B follow-up).
--
-- DRC users type French without accents, so "telephone" must match
-- "Téléphones". And a one-word typo ("Tecnoo") must still match a long title
-- ("Tecno Spark 10 Pro"), which plain `similarity` over the whole title misses.
--
-- Fix: unaccent the FTS vector + queries, and switch fuzzy matching to
-- word_similarity (`<%`). Requires an IMMUTABLE unaccent wrapper so it can be
-- used in a generated column + expression indexes.
--
-- Run on prod via the "Apply prod migration" GitHub Action.
--
-- Idempotent: CREATE OR REPLACE / IF NOT EXISTS; the generated column is
-- dropped + re-added (same end state on re-run). Safe to re-run.

CREATE EXTENSION IF NOT EXISTS unaccent;

-- IMMUTABLE wrapper (the 2-arg unaccent with an explicit dictionary is
-- immutable, unlike the 1-arg form) — required for generated columns / indexes.
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $func$
  SELECT public.unaccent('public.unaccent', $1)
$func$;

-- Rebuild the search vector over UNACCENTED text. Dropping the column also
-- drops its dependent GIN index; both are re-created below.
ALTER TABLE "products" DROP COLUMN IF EXISTS "search_vector";
ALTER TABLE "products"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'french',
      public.f_unaccent(coalesce("title", '') || ' ' || coalesce("description", ''))
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS "products_search_vector_idx"
  ON "products" USING GIN ("search_vector");

-- Trigram index on the UNACCENTED title for word_similarity (typo tolerance).
CREATE INDEX IF NOT EXISTS "products_title_unaccent_trgm_idx"
  ON "products" USING GIN (public.f_unaccent("title") gin_trgm_ops);
