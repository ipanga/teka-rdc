-- Prune BrandCategory links whose target is not a live LEAF category
--
-- NOT auto-applied. This deletes rows, so it ships via the "Apply prod
-- migration" workflow (Actions → Run workflow → paste this filename), never
-- through auto-apply.list.
--
-- WHY
--   Brands are offered per product type. `BrandCategory`'s own schema comment
--   says "the seller form shows only the brands linked to the chosen
--   subcategory", and the seller UI resolves brands for the LEAF the seller
--   picked. Links pointing at an intermediate node or at a soft-deleted
--   category can therefore never be shown — they are dead rows left by the
--   June 2026 taxonomy refactor, the same drift that put "Type de peau" on
--   « Mode > Homme » (docs/seller-catalog-taxonomy.md).
--
-- MEASURED before writing this (2026-09-02, production audit + dev):
--   brand_categories rows                                    435
--     → live leaf category            (KEEP)                 314
--     → live INTERMEDIATE category    (remove)                68   (66 of them
--                                                                  on live brands,
--                                                                  2 on soft-deleted
--                                                                  brands)
--     → soft-deleted category         (remove)                53
--     → missing category              (remove)                 0
--   Expected rows after:                                     314
--
-- ON THE "8 SEMANTICALLY WRONG MAPPINGS"
--   Enumerated, those 8 brand→root pairs are 18 individual links, and 16 of
--   them already point at an intermediate node, so this rule removes them
--   without naming a single brand:
--     Adidas / Puma / Lacoste / Bata → Électroménager > Climatisation
--                                    → Électroménager > Entretien Maison
--     Nivea                          → Électroménager > Réfrigération
--     Dove                           → Mode > Homme / Enfants / Accessoires
--     L'Oréal                        → Mode > Homme / Femme
--     Garnier                        → Mode > Enfants / Chaussures
--   The remaining 2 are Lacoste → Beauté & Santé > Parfums > Parfums Homme
--   and > Parfums Femme. Those are LEAF links and they are CORRECT — Lacoste
--   is a genuine fragrance brand — so they are deliberately NOT removed. This
--   migration therefore needs no brand allow/deny list at all: "not a live
--   leaf" is the whole rule.
--
-- SAFETY
--   * No Brand row is deleted. Only brand_categories link rows.
--   * "Autre" keeps all 145 of its live-leaf links (154 today), so the
--     fallback brand stays available everywhere it legitimately applies.
--   * The brandId = NULL / no-brand workflow is untouched — it does not use
--     this table.
--   * REVERSIBLE: every removed row is copied into
--     brand_categories_archive_20260902 first, with the reason. Rollback:
--       INSERT INTO brand_categories ("brandId","categoryId")
--       SELECT "brandId","categoryId" FROM brand_categories_archive_20260902
--       ON CONFLICT DO NOTHING;
--   * IDEMPOTENT: the archive insert is ON CONFLICT DO NOTHING and the delete
--     re-evaluates the same predicate, so a second run archives nothing and
--     deletes nothing.
--   * A category is "intermediate" only if it has at least one NON-deleted
--     child. A node whose children are all soft-deleted is a leaf and is kept.
--
-- DETECTION (run first; re-run after — the second count must be 0):
--   SELECT COUNT(*) FROM brand_categories bc
--     LEFT JOIN categories c ON c.id = bc."categoryId"
--    WHERE c.id IS NULL
--       OR c."deletedAt" IS NOT NULL
--       OR EXISTS (SELECT 1 FROM categories k
--                   WHERE k."parentCategoryId" = bc."categoryId"
--                     AND k."deletedAt" IS NULL);

BEGIN;

CREATE TABLE IF NOT EXISTS brand_categories_archive_20260902 (
  "brandId"    uuid        NOT NULL,
  "categoryId" uuid        NOT NULL,
  reason       text        NOT NULL,
  "archivedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("brandId", "categoryId")
);

INSERT INTO brand_categories_archive_20260902 ("brandId", "categoryId", reason)
SELECT bc."brandId",
       bc."categoryId",
       CASE
         WHEN c.id IS NULL                THEN 'missing_category'
         WHEN c."deletedAt" IS NOT NULL   THEN 'soft_deleted_category'
         ELSE                                  'intermediate_category'
       END
  FROM brand_categories bc
  LEFT JOIN categories c ON c.id = bc."categoryId"
 WHERE c.id IS NULL
    OR c."deletedAt" IS NOT NULL
    OR EXISTS (SELECT 1 FROM categories k
                WHERE k."parentCategoryId" = bc."categoryId"
                  AND k."deletedAt" IS NULL)
ON CONFLICT ("brandId", "categoryId") DO NOTHING;

DELETE FROM brand_categories bc
 USING (SELECT bc2."brandId", bc2."categoryId"
          FROM brand_categories bc2
          LEFT JOIN categories c ON c.id = bc2."categoryId"
         WHERE c.id IS NULL
            OR c."deletedAt" IS NOT NULL
            OR EXISTS (SELECT 1 FROM categories k
                        WHERE k."parentCategoryId" = bc2."categoryId"
                          AND k."deletedAt" IS NULL)) doomed
 WHERE bc."brandId" = doomed."brandId"
   AND bc."categoryId" = doomed."categoryId";

COMMIT;
