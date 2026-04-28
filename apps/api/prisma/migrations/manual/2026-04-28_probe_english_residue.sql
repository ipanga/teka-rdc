-- Probe for any remaining English text in user-visible TEXT columns after the
-- FR-only refactor + JSONB→TEXT migration.
--
-- Scans the same columns the bilingual migration touched and flags rows whose
-- value contains common English-only words (case-insensitive whole-word match):
--   the, and, with, online, delivery, supermarket, shopping, payment, buy,
--   smartphone, electronics, fashion, search, order, product, category,
--   please, hello, welcome, thank
--
-- "of" and "for" are intentionally excluded — they're proper-noun-friendly
-- and would produce false positives on French product names that include
-- English brand/title words.
--
-- This is a READ-ONLY probe. It produces a list; nothing is mutated. Run via:
--   bash scripts/run-prod-sql.sh apps/api/prisma/migrations/manual/2026-04-28_probe_english_residue.sql

\set RX '\\m(the|and|with|online|delivery|supermarket|shopping|payment|electronics|fashion|search|order|product|category|please|hello|welcome|thank)\\M'

\echo '--- categories.name ---'
SELECT id, name FROM categories WHERE name ~* :'RX' AND "deletedAt" IS NULL LIMIT 50;

\echo '--- categories.description ---'
SELECT id, LEFT(description, 200) AS description FROM categories WHERE description ~* :'RX' AND "deletedAt" IS NULL LIMIT 50;

\echo '--- products.title ---'
SELECT id, title FROM products WHERE title ~* :'RX' AND "deletedAt" IS NULL LIMIT 50;

\echo '--- products.description ---'
SELECT id, LEFT(description, 200) AS description FROM products WHERE description ~* :'RX' AND "deletedAt" IS NULL LIMIT 50;

\echo '--- product_attributes.name ---'
SELECT id, name FROM product_attributes WHERE name ~* :'RX' LIMIT 50;

\echo '--- banners.title ---'
SELECT id, title FROM banners WHERE title ~* :'RX' AND "deletedAt" IS NULL LIMIT 50;

\echo '--- banners.subtitle ---'
SELECT id, subtitle FROM banners WHERE subtitle ~* :'RX' AND "deletedAt" IS NULL LIMIT 50;

\echo '--- promotions.title ---'
SELECT id, title FROM promotions WHERE title ~* :'RX' AND "deletedAt" IS NULL LIMIT 50;

\echo '--- promotions.description ---'
SELECT id, LEFT(description, 200) AS description FROM promotions WHERE description ~* :'RX' AND "deletedAt" IS NULL LIMIT 50;

\echo '--- content_pages.title ---'
SELECT id, slug, title FROM content_pages WHERE title ~* :'RX' LIMIT 50;

\echo '--- content_pages.content (first 200 chars) ---'
SELECT id, slug, LEFT(content, 200) AS content_preview FROM content_pages WHERE content ~* :'RX' LIMIT 50;

\echo '--- cities.name ---'
SELECT id, name FROM cities WHERE name ~* :'RX' LIMIT 50;

\echo '--- communes.name ---'
SELECT id, name FROM communes WHERE name ~* :'RX' LIMIT 50;

\echo '--- system_settings.label ---'
SELECT key, label FROM system_settings WHERE label ~* :'RX' LIMIT 50;

\echo '--- order_items.productTitle (latest 50 with English match) ---'
SELECT id, "productTitle" FROM order_items WHERE "productTitle" ~* :'RX' ORDER BY "createdAt" DESC LIMIT 50;
