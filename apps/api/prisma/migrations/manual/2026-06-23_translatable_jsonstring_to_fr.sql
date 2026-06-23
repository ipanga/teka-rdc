-- 2026-06-23 — Flatten residual `{"fr":…,"en":…}` JSON-STRING values to plain French.
--
-- Context: the 2026-05-19 jsonb→text migration (migrate-jsonb-to-text.ts) converted
-- the translatable columns it knew about, but TWO columns still hold the stringified
-- bilingual object as TEXT in some environments:
--   • product_attributes.name   — legacy pre-taxonomy attributes (deactivated categories)
--   • order_items."productTitle" — order snapshots taken before that migration
-- Prod was verified CLEAN (0 rows) on 2026-06-23; dev still had 88 + 11 rows. This
-- backfill makes every environment match. It is the data prerequisite for removing the
-- client-side `{fr,en}` parsers (attrLabel / getLocalizedName / _frAttributeLabel).
--
-- Idempotent + safe: each UPDATE only touches rows whose value is a JSON object that
-- actually carries an "fr" key. Already-plain rows are untouched. Re-running is a no-op.

UPDATE product_attributes
SET name = name::jsonb->>'fr'
WHERE name LIKE '{%'
  AND (name::jsonb ? 'fr');

UPDATE order_items
SET "productTitle" = "productTitle"::jsonb->>'fr'
WHERE "productTitle" LIKE '{%'
  AND ("productTitle"::jsonb ? 'fr');
