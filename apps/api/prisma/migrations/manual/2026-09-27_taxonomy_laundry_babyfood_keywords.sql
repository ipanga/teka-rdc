-- Laundry type, « Alimentation bébé », category search aliases (2026-09-27).
-- Initiative: docs/seller-catalogue-speedup.md — Seller Catalogue Speed-up, PR D.
--
-- WHY
--   « Lessive » offered only Volume + expiry, so a seller could not say whether
--   a product is powder, liquid, capsules or laundry soap, and powder — sold by
--   weight — had nowhere to record it. The answer is a CHARACTERISTIC, not four
--   sibling categories a seller must choose between.
--   Baby cereal (Cerelac), porridge and purées had no leaf: the nearest were
--   « Lait infantile » (formula, a different product family) and the general
--   « Céréales ».
--   Sellers search the category picker with shelf words (« savon poudre »,
--   « eau de javel », « bouillie bébé »); these become invisible aliases.
--
-- SHAPE (all by deterministic id, exactly what seed.ts would write)
--   1. guards — refuse, writing nothing, on any unexpected pre-state;
--   2. leaf 16000000-…010505 « Alimentation bébé » under Supermarché › Bébé;
--   3. product_attributes for Lessive (slots 1–2 re-asserted unchanged, 3–4
--      APPENDED) and the new leaf — GENERATED from taxonomy-data.ts;
--   4. brands Boom (71) and Cerelac (72) + links: Boom → Lessive; Cerelac,
--      Nestlé and the catch-all « Autre » → Alimentation bébé;
--   5. search aliases on ten leaves — GENERATED, written only where the list
--      is still empty so an admin's edits are never overwritten.
--
-- NOTHING MOVES: no product changes category, no id or slug is regenerated,
-- no specification is touched. The Lessive product « Savon de lessive »
-- (vnkqce) keeps its legacy specification; the new « Type de lessive = Savon »
-- makes a later repoint possible, but that is a separate catalogue decision.
--
-- ADDITIVE and IDEMPOTENT: every write is an upsert, ON CONFLICT DO NOTHING,
-- or an UPDATE guarded to a no-op on re-run. Safe before the rolling swap: the
-- previous release reads categories, attributes and brands generically.
-- Requires 2026-09-27_category_search_keywords.sql (listed before it).
--
-- ROLLBACK at the bottom (commented, manual only).

-- One transaction: the runner (apply-auto.sh) executes files with plain
-- psql -f, so without this a failure mid-file would leave a partial state.
BEGIN;

-- ── 1. guards ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "categories"
                  WHERE "id" = '13000000-0000-0000-0000-000000000105'
                    AND "isActive" AND "deletedAt" IS NULL) THEN
    RAISE EXCEPTION 'REFUSED: parent « Bébé » (13000000-…105) is missing or inactive';
  END IF;
  IF EXISTS (SELECT 1 FROM "categories"
              WHERE "slug" = 'alimentation-bebe'
                AND "id" <> '16000000-0000-0000-0000-000000010505') THEN
    RAISE EXCEPTION 'REFUSED: slug alimentation-bebe already belongs to another category';
  END IF;
  IF EXISTS (SELECT 1 FROM "categories"
              WHERE "id" = '16000000-0000-0000-0000-000000010505'
                AND "parentCategoryId" IS DISTINCT FROM '13000000-0000-0000-0000-000000000105') THEN
    RAISE EXCEPTION 'REFUSED: id …010505 already exists under another parent';
  END IF;
  IF EXISTS (SELECT 1 FROM "product_attributes"
              WHERE "id" IN ('14000000-0000-0000-0000-000001040103', '14000000-0000-0000-0000-000001040104')
                AND "categoryId" <> '16000000-0000-0000-0000-000000010401') THEN
    RAISE EXCEPTION 'REFUSED: a Lessive attribute id is already used by another category';
  END IF;
  IF EXISTS (SELECT 1 FROM "brands"
              WHERE ("id" = '15000000-0000-0000-0000-000000000071' AND "name" <> 'Boom')
                 OR ("id" = '15000000-0000-0000-0000-000000000072' AND "name" <> 'Cerelac')
                 OR (lower("name") = 'boom' AND "id" <> '15000000-0000-0000-0000-000000000071')
                 OR (lower("name") = 'cerelac' AND "id" <> '15000000-0000-0000-0000-000000000072')) THEN
    RAISE EXCEPTION 'REFUSED: brand slot 71/72 or the name Boom/Cerelac is already taken by another row';
  END IF;
END
$$;

-- ── 2. Supermarché › Bébé › Alimentation bébé ──────────────────────────────
INSERT INTO "categories" ("id", "slug", "name", "parentCategoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES ('16000000-0000-0000-0000-000000010505', 'alimentation-bebe', 'Alimentation bébé',
        '13000000-0000-0000-0000-000000000105', 5, TRUE, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE
  SET "slug" = EXCLUDED."slug", "name" = EXCLUDED."name",
      "parentCategoryId" = EXCLUDED."parentCategoryId",
      "sortOrder" = EXCLUDED."sortOrder",
      "isActive" = TRUE, "deletedAt" = NULL, "updatedAt" = NOW();

-- ── 3. characteristics ─────────────────────────────────────────────────────
-- GENERATED BLOCK BEGIN — renderAttributeSql([10401, 10505]); do not edit by hand
INSERT INTO "product_attributes"
  ("id", "categoryId", "name", "type", "options", "isRequired", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('14000000-0000-0000-0000-000001040101', '16000000-0000-0000-0000-000000010401', 'Volume', 'TEXT'::"AttributeType", NULL, FALSE, 1, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001040102', '16000000-0000-0000-0000-000000010401', 'Date d''expiration', 'TEXT'::"AttributeType", NULL, FALSE, 2, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001040103', '16000000-0000-0000-0000-000000010401', 'Type de lessive', 'SELECT'::"AttributeType", '["Poudre","Liquide","Capsules","Savon"]'::jsonb, FALSE, 3, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001040104', '16000000-0000-0000-0000-000000010401', 'Poids', 'TEXT'::"AttributeType", NULL, FALSE, 4, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001050501', '16000000-0000-0000-0000-000000010505', 'Poids', 'TEXT'::"AttributeType", NULL, FALSE, 1, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001050502', '16000000-0000-0000-0000-000000010505', 'Date d''expiration', 'TEXT'::"AttributeType", NULL, FALSE, 2, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE
  SET "categoryId" = EXCLUDED."categoryId",
      "name"       = EXCLUDED."name",
      "type"       = EXCLUDED."type",
      "options"    = EXCLUDED."options",
      "isRequired" = EXCLUDED."isRequired",
      "sortOrder"  = EXCLUDED."sortOrder",
      "updatedAt"  = NOW();
-- GENERATED BLOCK END

-- ── 4. brands + links ──────────────────────────────────────────────────────
INSERT INTO "brands" ("id", "name", "slug", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('15000000-0000-0000-0000-000000000071', 'Boom', 'boom', TRUE, 71, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000072', 'Cerelac', 'cerelac', TRUE, 72, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "brand_categories" ("brandId", "categoryId")
VALUES
  ('15000000-0000-0000-0000-000000000071', '16000000-0000-0000-0000-000000010401'),  -- Boom → Lessive
  ('15000000-0000-0000-0000-000000000072', '16000000-0000-0000-0000-000000010505'),  -- Cerelac → Alimentation bébé
  ('15000000-0000-0000-0000-000000000047', '16000000-0000-0000-0000-000000010505'),  -- Nestlé → Alimentation bébé
  ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010505')   -- Autre → Alimentation bébé
ON CONFLICT DO NOTHING;

-- ── 5. search aliases (only where still empty) ─────────────────────────────
-- GENERATED KEYWORDS BEGIN — renderKeywordSql([...]); do not edit by hand
UPDATE "categories" SET "searchKeywords" = ARRAY['savon de toilette', 'savonnette', 'savon de bain']::TEXT[], "updatedAt" = NOW()
 WHERE "id" = '16000000-0000-0000-0000-000000010301' AND "searchKeywords" = '{}';
UPDATE "categories" SET "searchKeywords" = ARRAY['lessive en poudre', 'lessive poudre', 'poudre à lessiver', 'savon en poudre', 'savon poudre', 'savon de lessive', 'lessive liquide', 'capsules de lessive', 'détergent', 'linge']::TEXT[], "updatedAt" = NOW()
 WHERE "id" = '16000000-0000-0000-0000-000000010401' AND "searchKeywords" = '{}';
UPDATE "categories" SET "searchKeywords" = ARRAY['liquide vaisselle', 'vaisselle', 'dégraissant']::TEXT[], "updatedAt" = NOW()
 WHERE "id" = '16000000-0000-0000-0000-000000010402' AND "searchKeywords" = '{}';
UPDATE "categories" SET "searchKeywords" = ARRAY['eau de javel', 'chlore', 'blanchissant']::TEXT[], "updatedAt" = NOW()
 WHERE "id" = '16000000-0000-0000-0000-000000010403' AND "searchKeywords" = '{}';
UPDATE "categories" SET "searchKeywords" = ARRAY['nettoyant sol', 'nettoyant vitres', 'nettoyant wc']::TEXT[], "updatedAt" = NOW()
 WHERE "id" = '16000000-0000-0000-0000-000000010404' AND "searchKeywords" = '{}';
UPDATE "categories" SET "searchKeywords" = ARRAY['antiseptique', 'antibactérien']::TEXT[], "updatedAt" = NOW()
 WHERE "id" = '16000000-0000-0000-0000-000000010405' AND "searchKeywords" = '{}';
UPDATE "categories" SET "searchKeywords" = ARRAY['couches bébé', 'couches jetables', 'couche-culotte']::TEXT[], "updatedAt" = NOW()
 WHERE "id" = '16000000-0000-0000-0000-000000010501' AND "searchKeywords" = '{}';
UPDATE "categories" SET "searchKeywords" = ARRAY['lait bébé', 'lait 1er âge', 'lait 2e âge', 'formule infantile']::TEXT[], "updatedAt" = NOW()
 WHERE "id" = '16000000-0000-0000-0000-000000010503' AND "searchKeywords" = '{}';
UPDATE "categories" SET "searchKeywords" = ARRAY['nourriture bébé', 'aliment bébé', 'céréales bébé', 'céréales infantiles', 'bouillie bébé', 'bouillie infantile', 'farine bébé', 'purée bébé', 'petit pot', 'nestlé cerelac']::TEXT[], "updatedAt" = NOW()
 WHERE "id" = '16000000-0000-0000-0000-000000010505' AND "searchKeywords" = '{}';
UPDATE "categories" SET "searchKeywords" = ARRAY['gel douche', 'savon liquide']::TEXT[], "updatedAt" = NOW()
 WHERE "id" = '16000000-0000-0000-0000-000000060201' AND "searchKeywords" = '{}';
-- GENERATED KEYWORDS END

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (run by hand only; not part of any automatic path). Refuses nothing
-- itself — first confirm no product sits on …010505 and no specification uses
-- …1040103/…1040104. The leaf is DEACTIVATED, not deleted (same as seed.ts).
--
-- UPDATE "categories" SET "isActive" = FALSE, "slug" = NULL, "updatedAt" = NOW()
--  WHERE "id" = '16000000-0000-0000-0000-000000010505';
-- DELETE FROM "product_attributes"
--  WHERE "id" IN ('14000000-0000-0000-0000-000001040103', '14000000-0000-0000-0000-000001040104')
--    AND NOT EXISTS (SELECT 1 FROM "product_specifications" s WHERE s."attributeId" = "product_attributes"."id");
-- DELETE FROM "brand_categories" WHERE "brandId" IN ('15000000-0000-0000-0000-000000000071', '15000000-0000-0000-0000-000000000072');
-- UPDATE "brands" SET "isActive" = FALSE, "deletedAt" = NOW()
--  WHERE "id" IN ('15000000-0000-0000-0000-000000000071', '15000000-0000-0000-0000-000000000072');
-- UPDATE "categories" SET "searchKeywords" = '{}' WHERE "id" LIKE '16000000-%';
