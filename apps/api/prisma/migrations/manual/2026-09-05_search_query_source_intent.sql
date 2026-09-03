-- Search analytics: record WHICH buyer surface a search came from and WHY it
-- was recorded (2026-09-05).
--
-- Run on prod via the "Apply prod migration" workflow, or automatically during
-- deploy — this file IS listed in auto-apply.list because it is purely additive
-- and backward-compatible: the old code never reads or writes these columns, so
-- it keeps serving unchanged while the migration runs ahead of the swap.
--
-- Idempotent: enum creation guarded on pg_type, ADD COLUMN IF NOT EXISTS.
-- Safe to re-run.
--
-- No backfill, deliberately. Existing rows keep source = 'UNKNOWN', which is the
-- truthful reading: they were written by clients that predate the parameter.
-- Labelling them BUYER_WEB would be a guess presented as fact.
--
-- ADD COLUMN with a non-volatile DEFAULT is O(1) in PG 11+, so this does not
-- rewrite the table.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SearchQuerySource') THEN
    CREATE TYPE "SearchQuerySource" AS ENUM ('BUYER_WEB', 'BUYER_MOBILE', 'UNKNOWN');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SearchQueryIntent') THEN
    CREATE TYPE "SearchQueryIntent" AS ENUM ('SUBMIT', 'SUGGESTION');
  END IF;
END$$;

ALTER TABLE "search_queries"
  ADD COLUMN IF NOT EXISTS "source" "SearchQuerySource" NOT NULL DEFAULT 'UNKNOWN';

ALTER TABLE "search_queries"
  ADD COLUMN IF NOT EXISTS "intent" "SearchQueryIntent" NOT NULL DEFAULT 'SUBMIT';

-- No new index. The admin reporting queries this feeds were EXPLAINed against
-- the real table (53 rows over ~70 days) and Postgres seq-scans it in well under
-- a millisecond; an index would never be chosen and would only add write cost to
-- the hot search path. Revisit when search_queries reaches the low hundreds of
-- thousands of rows, or when EXPLAIN shows the filter dominating.
