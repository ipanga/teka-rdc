-- Ordinary-milk branch, alcohol branch, duplicate-deodorant retirement (2026-09-10).
-- Initiative: docs/pre-scale-readiness.md — taxonomy/data quality (PR C).
--
-- WHY
--   The only dairy node in the whole 187-node tree was « Lait infantile »
--   under Supermarché > Bébé, so everyday milk had nowhere to go. The one real
--   milk product in production, "Lato Milk – Lait entier en poudre – 400 g",
--   had been filed under Supermarché > Boissons > Café, live on the storefront.
--   The tree also had NO alcohol leaf at all, so the one whisky in production,
--   "Johnnie Walker Red Label 1000 ml", sat directly on the INTERMEDIATE node
--   Supermarché > Boissons — which the model does not allow for a product. It
--   is the only live product in that state (84 others are already soft-deleted;
--   read-only audit, prisma/scripts/audit-prod-taxonomy.ts).
--
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

-- ── 3b. Supermarché > Boissons Alcoolisées + its three leaves ───────────────
INSERT INTO "categories" ("id", "slug", "name", "parentCategoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES (
  '13000000-0000-0000-0000-000000000107',
  'boissons-alcoolisees',
  'Boissons Alcoolisées',
  '13000000-0000-0000-0000-000000000001',
  7, TRUE, NOW(), NOW()
)
ON CONFLICT ("id") DO UPDATE
  SET "slug" = EXCLUDED."slug", "name" = EXCLUDED."name",
      "parentCategoryId" = EXCLUDED."parentCategoryId",
      "sortOrder" = EXCLUDED."sortOrder",
      "isActive" = TRUE, "deletedAt" = NULL, "updatedAt" = NOW();

INSERT INTO "categories" ("id", "slug", "name", "parentCategoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
  ('16000000-0000-0000-0000-000000010701', 'bieres',     'Bières',     '13000000-0000-0000-0000-000000000107', 1, TRUE, NOW(), NOW()),
  ('16000000-0000-0000-0000-000000010702', 'vins',       'Vins',       '13000000-0000-0000-0000-000000000107', 2, TRUE, NOW(), NOW()),
  ('16000000-0000-0000-0000-000000010703', 'spiritueux', 'Spiritueux', '13000000-0000-0000-0000-000000000107', 3, TRUE, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE
  SET "slug" = EXCLUDED."slug", "name" = EXCLUDED."name",
      "parentCategoryId" = EXCLUDED."parentCategoryId",
      "sortOrder" = EXCLUDED."sortOrder",
      "isActive" = TRUE, "deletedAt" = NULL, "updatedAt" = NOW();

-- ── 3c. move the whisky off the INTERMEDIATE « Boissons » node ──────────────
-- Guarded on shortCode, which is unique per product, AND on the wrong parent,
-- so a re-run after the move is a no-op and no other row can match. The
-- product keeps its id, seller, images, price, stock, reviews and orders.
-- Its two legacy specifications (« Type = Bière », « Volume = 1L ») belong to
-- a soft-deleted category and are deliberately left alone: cleaning them is a
-- separate decision, and « Type = Bière » on a whisky is wrong data, not a
-- wrong category.
UPDATE "products"
   SET "categoryId" = '16000000-0000-0000-0000-000000010703',
       "updatedAt"  = NOW()
 WHERE "shortCode" = 'rb7t4r'
   AND "categoryId" = '13000000-0000-0000-0000-000000000102';

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
-- UPDATE "products"
--    SET "categoryId" = '13000000-0000-0000-0000-000000000102', "updatedAt" = NOW()
--  WHERE "shortCode" = 'rb7t4r';
--
-- UPDATE "categories"
--    SET "isActive" = FALSE, "slug" = NULL, "updatedAt" = NOW()
--  WHERE "id" IN (
--    '13000000-0000-0000-0000-000000000106',
--    '16000000-0000-0000-0000-000000010601',
--    '16000000-0000-0000-0000-000000010602',
--    '16000000-0000-0000-0000-000000010603',
--    '13000000-0000-0000-0000-000000000107',
--    '16000000-0000-0000-0000-000000010701',
--    '16000000-0000-0000-0000-000000010702',
--    '16000000-0000-0000-0000-000000010703'
--  );
