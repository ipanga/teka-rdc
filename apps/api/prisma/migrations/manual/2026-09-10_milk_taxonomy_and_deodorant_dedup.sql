-- Ordinary-milk branch + duplicate-deodorant retirement (2026-09-10).
-- Initiative: docs/pre-scale-readiness.md — taxonomy/data quality (PR C).
--
-- WHY
--   The only dairy node in the whole 187-node tree was « Lait infantile »
--   under Supermarché > Bébé, so everyday milk had nowhere to go. The one real
--   milk product in production, "Lato Milk – Lait entier en poudre – 400 g",
--   had been filed under Supermarché > Boissons > Café, live on the storefront.
--   Separately, « Déodorants » existed as TWO distinct rows (10304 under
--   Supermarché > Hygiène Personnelle and 60202 under Beauté & Santé > Soins
--   Personnels). Both held zero products; only 60202 has brand links.
--
-- SHAPE
--   The tree is exactly three levels (taxonomy-data.ts header), so the milk
--   grouping is a SUBCATEGORY of Supermarché, sibling of Alimentation — not a
--   child of it, which would need a fourth level.
--
-- ADDITIVE and IDEMPOTENT, safe to re-run and safe to run before the rolling
-- swap: the old code reads categories generically and simply sees three more.
-- Nothing is hard-deleted. The retired deodorant row is deactivated and has its
-- slug released, exactly what seed.ts does for a node dropped from the strict
-- tree.
--
-- Deterministic ids follow the existing scheme (seed.ts): 13000000- for
-- subcategories, 16000000- for leaves, zero-padded numeric key.
--
-- ROLLBACK (bottom of this file, commented) restores the previous state
-- exactly: it re-activates 10304 with its slug and moves the milk product back.

-- ── 1. Supermarché > Lait & Produits Laitiers (subcategory) ─────────────────
INSERT INTO "categories" ("id", "slug", "name", "parentCategoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES (
  '13000000-0000-0000-0000-000000000106',
  'lait-et-produits-laitiers',
  'Lait & Produits Laitiers',
  '13000000-0000-0000-0000-000000000001',
  6, TRUE, NOW(), NOW()
)
ON CONFLICT ("id") DO UPDATE
  SET "slug" = EXCLUDED."slug",
      "name" = EXCLUDED."name",
      "parentCategoryId" = EXCLUDED."parentCategoryId",
      "sortOrder" = EXCLUDED."sortOrder",
      "isActive" = TRUE,
      "deletedAt" = NULL,
      "updatedAt" = NOW();

-- ── 2. its three leaves ─────────────────────────────────────────────────────
INSERT INTO "categories" ("id", "slug", "name", "parentCategoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
  ('16000000-0000-0000-0000-000000010601', 'lait-en-poudre',            'Lait en poudre',            '13000000-0000-0000-0000-000000000106', 1, TRUE, NOW(), NOW()),
  ('16000000-0000-0000-0000-000000010602', 'lait-liquide-uht',          'Lait liquide / UHT',        '13000000-0000-0000-0000-000000000106', 2, TRUE, NOW(), NOW()),
  ('16000000-0000-0000-0000-000000010603', 'lait-concentre-evapore',    'Lait concentré / évaporé',  '13000000-0000-0000-0000-000000000106', 3, TRUE, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE
  SET "slug" = EXCLUDED."slug",
      "name" = EXCLUDED."name",
      "parentCategoryId" = EXCLUDED."parentCategoryId",
      "sortOrder" = EXCLUDED."sortOrder",
      "isActive" = TRUE,
      "deletedAt" = NULL,
      "updatedAt" = NOW();

-- ── 3. move the misclassified milk product off « Café » ─────────────────────
-- Matched by id so the statement can never touch another row. The product row
-- itself is untouched otherwise: same id, seller, images, price, stock,
-- reviews and order history.
UPDATE "products"
   SET "categoryId" = '16000000-0000-0000-0000-000000010601',
       "updatedAt"  = NOW()
 WHERE "slug" = 'lato-milk-lait-entier-en-poudre-lato-400-g'
   AND "categoryId" = '16000000-0000-0000-0000-000000010204';

-- ── 4. retire the duplicate deodorant leaf ──────────────────────────────────
-- Deactivate + release the slug. NOT deleted: the row keeps its id so any
-- historical reference still resolves. Guarded on having no products, so the
-- statement is a no-op rather than a surprise if one was listed meanwhile.
UPDATE "categories"
   SET "isActive"  = FALSE,
       "slug"      = NULL,
       "updatedAt" = NOW()
 WHERE "id" = '16000000-0000-0000-0000-000000010304'
   AND NOT EXISTS (
     SELECT 1 FROM "products" p
      WHERE p."categoryId" = '16000000-0000-0000-0000-000000010304'
        AND p."deletedAt" IS NULL
   );

-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (run by hand only; not part of any automatic path)
--
-- UPDATE "products"
--    SET "categoryId" = '16000000-0000-0000-0000-000000010204', "updatedAt" = NOW()
--  WHERE "slug" = 'lato-milk-lait-entier-en-poudre-lato-400-g';
--
-- UPDATE "categories"
--    SET "isActive" = TRUE, "slug" = 'deodorants', "updatedAt" = NOW()
--  WHERE "id" = '16000000-0000-0000-0000-000000010304';
--
-- UPDATE "categories"
--    SET "isActive" = FALSE, "slug" = NULL, "updatedAt" = NOW()
--  WHERE "id" IN (
--    '13000000-0000-0000-0000-000000000106',
--    '16000000-0000-0000-0000-000000010601',
--    '16000000-0000-0000-0000-000000010602',
--    '16000000-0000-0000-0000-000000010603'
--  );
