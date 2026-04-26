-- Drop EN from translatable JSONB columns — convert each `{ fr, en }` JSONB
-- column to a plain TEXT column holding only the FR value.
--
-- Run this BEFORE deploying the new code that expects plain-text columns.
-- Idempotent: each step is wrapped in a guard that skips already-migrated
-- columns. Safe to re-run.
--
-- DESTRUCTIVE: every row's `en` translation is permanently dropped. EN data
-- cannot be recovered after running this. Backup first.
--
-- Recommended run path:
--   docker compose --env-file .env.production -f docker-compose.prod.yml exec -T api \
--     sh -c 'echo "$DATABASE_URL"' | xargs -I{} psql "{}" -f /tmp/2026-04-25_drop_en_jsonb.sql

BEGIN;

-- Helper: convert one JSONB column to TEXT in place.
-- Reads `<table>.<col>->>'fr'` into a temp column, drops the JSONB column,
-- renames the temp column to take its place. The temp suffix avoids name
-- collisions during the swap.

-- ───────────────────────────────────────────────────────────────────
-- City.name           Json     → String
-- Commune.name        Json     → String
-- Category.name       Json     → String  (NOT NULL)
-- Category.description Json?   → String?
-- Product.title       Json     → String  (NOT NULL)
-- Product.description Json     → String  (NOT NULL)
-- ProductAttribute.name Json   → String  (NOT NULL)
-- OrderItem.productTitle Json  → String  (NOT NULL)
-- Banner.title        Json     → String  (NOT NULL)
-- Banner.subtitle     Json?    → String?
-- Promotion.title     Json     → String  (NOT NULL)
-- Promotion.description Json?  → String?
-- ContentPage.title   Json     → String  (NOT NULL)
-- ContentPage.content Json     → String  (NOT NULL)
-- SystemSetting.label Json?    → String?
-- ───────────────────────────────────────────────────────────────────

DO $$
DECLARE
  -- (table_name, column_name, nullable)
  cols text[][] := ARRAY[
    ARRAY['cities',           'name',         'NOT NULL'],
    ARRAY['communes',         'name',         'NOT NULL'],
    ARRAY['categories',       'name',         'NOT NULL'],
    ARRAY['categories',       'description',  'NULL'],
    ARRAY['products',         'title',        'NOT NULL'],
    ARRAY['products',         'description',  'NOT NULL'],
    ARRAY['product_attributes','name',        'NOT NULL'],
    ARRAY['order_items',      'productTitle', 'NOT NULL'],
    ARRAY['banners',          'title',        'NOT NULL'],
    ARRAY['banners',          'subtitle',     'NULL'],
    ARRAY['promotions',       'title',        'NOT NULL'],
    ARRAY['promotions',       'description',  'NULL'],
    ARRAY['content_pages',    'title',        'NOT NULL'],
    ARRAY['content_pages',    'content',      'NOT NULL'],
    ARRAY['system_settings',  'label',        'NULL']
  ];
  r          text[];
  col_type   text;
  tmp_col    text;
BEGIN
  FOREACH r SLICE 1 IN ARRAY cols LOOP
    -- Skip if column already migrated (already TEXT).
    -- NB: must alias the column to avoid colliding with the PL/pgSQL
    -- local variable named the same as `information_schema.columns.data_type`.
    SELECT c.data_type INTO col_type
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = r[1]
      AND c.column_name = r[2];

    IF col_type = 'jsonb' OR col_type = 'json' THEN
      -- Build the temp column name as a separate identifier so format(%I)
      -- quotes it correctly. Doing `%I_text_tmp` produces `"camelCase"_text_tmp`
      -- which is broken syntax for camelCase column names like productTitle.
      tmp_col := r[2] || '_text_tmp';

      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN %I TEXT',
        r[1], tmp_col
      );
      EXECUTE format(
        'UPDATE %I SET %I = COALESCE(%I->>''fr'', %I::text)',
        r[1], tmp_col, r[2], r[2]
      );
      EXECUTE format(
        'ALTER TABLE %I DROP COLUMN %I',
        r[1], r[2]
      );
      EXECUTE format(
        'ALTER TABLE %I RENAME COLUMN %I TO %I',
        r[1], tmp_col, r[2]
      );
      IF r[3] = 'NOT NULL' THEN
        -- Defensive: anything that was null after the COALESCE gets ''
        -- (shouldn't happen if data is well-formed).
        EXECUTE format(
          'UPDATE %I SET %I = '''' WHERE %I IS NULL',
          r[1], r[2], r[2]
        );
        EXECUTE format(
          'ALTER TABLE %I ALTER COLUMN %I SET NOT NULL',
          r[1], r[2]
        );
      END IF;
      RAISE NOTICE 'Migrated %.%', r[1], r[2];
    ELSE
      RAISE NOTICE 'Skipped %.% (already %)', r[1], r[2], col_type;
    END IF;
  END LOOP;
END $$;

COMMIT;
