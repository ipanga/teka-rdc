-- Advanced search Phase 2: synonyms + search logging + brand/category fuzzy indexes.
-- Idempotent (safe to re-run). Apply via the "Apply prod migration" GitHub Action.
-- Depends on: pg_trgm + the public.f_unaccent() IMMUTABLE wrapper (2026-06-07_product_search_unaccent.sql).

-- 1) Synonym groups — admin-editable, applied as query-expansion at search time.
--    e.g. terms = {'gsm','portable','smartphone','telephone'} (store unaccented/lowercase).
CREATE TABLE IF NOT EXISTS "search_synonyms" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "terms"     text[] NOT NULL,
  "isActive"  boolean NOT NULL DEFAULT true,
  "note"      text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "search_synonyms_terms_idx"
  ON "search_synonyms" USING GIN ("terms");

-- 2) Search log — powers popular/trending suggestions + zero-result reporting.
--    Written fire-and-forget on the first page of each search. Pruneable by createdAt.
CREATE TABLE IF NOT EXISTS "search_queries" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "term"           text NOT NULL,
  "termNormalized" text NOT NULL,
  "resultCount"    integer NOT NULL,
  "cityId"         uuid,
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "search_queries_normalized_createdAt_idx"
  ON "search_queries" ("termNormalized", "createdAt");
CREATE INDEX IF NOT EXISTS "search_queries_createdAt_idx"
  ON "search_queries" ("createdAt");
CREATE INDEX IF NOT EXISTS "search_queries_resultCount_idx"
  ON "search_queries" ("resultCount");

-- 3) Trigram (fuzzy) indexes on unaccented brand + category names, so autocomplete
--    can typo-tolerantly match brands/product types (not just product titles).
CREATE INDEX IF NOT EXISTS "brands_name_unaccent_trgm_idx"
  ON "brands" USING GIN (public.f_unaccent("name") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "categories_name_unaccent_trgm_idx"
  ON "categories" USING GIN (public.f_unaccent("name") gin_trgm_ops);

-- 4) Seed a starter set of French marketplace synonym groups (idempotent — only on
--    an empty table, so admins can freely edit/delete afterwards without re-seeding).
INSERT INTO "search_synonyms" ("terms", "note")
SELECT * FROM (VALUES
  (ARRAY['gsm','portable','smartphone','telephone','mobile'], 'Téléphones'),
  (ARRAY['frigo','refrigerateur','frigidaire'], 'Réfrigérateurs'),
  (ARRAY['tv','television','tele','televiseur'], 'Téléviseurs'),
  (ARRAY['ordinateur','pc','laptop','portable ordinateur'], 'Ordinateurs'),
  (ARRAY['clim','climatiseur','climatisation'], 'Climatisation'),
  (ARRAY['cuisiniere','gaziniere','rechaud'], 'Cuisson'),
  (ARRAY['casque','ecouteurs','oreillette'], 'Audio'),
  (ARRAY['parfum','eau de toilette','fragrance'], 'Parfums')
) AS v
WHERE NOT EXISTS (SELECT 1 FROM "search_synonyms");
