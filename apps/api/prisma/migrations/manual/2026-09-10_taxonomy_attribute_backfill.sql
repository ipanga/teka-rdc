-- Product characteristics for the leaves added on 2026-09-10 (2026-09-10).
-- Initiative: docs/pre-scale-readiness.md — taxonomy/data quality, P2 follow-up.
--
-- WHY
--   `2026-09-10_taxonomy_milk_alcohol_deodorant.sql` created eight category
--   rows — three milk leaves, three alcohol leaves and their two parents — and
--   moved two misclassified products onto them. It created ZERO
--   `product_attributes` rows, because it was hand-written while the attribute
--   templates live in `prisma/taxonomy-data.ts` and only `seed.ts` reads them.
--   Nothing tied the two together, so the omission was silent.
--
--   Verified in production, read-only, after that release shipped:
--     Lait en poudre / Lait liquide UHT / Lait concentré / Bières / Vins /
--     Spiritueux            → no attributes at all
--     Déodorants (60202)    → « Volume », « Date d'expiration » — the OLD
--                             CONSUMABLE template, not the deodorant one
--   A seller listing a milk or an alcohol therefore gets an empty
--   characteristics form (`GET /v1/browse/categories/:id/attributes` → []),
--   and a deodorant gets an expiry date instead of format and scent.
--
-- WHY NOT JUST RUN THE PROD SEED
--   `seed.ts` is not a targeted tool. It opens by deactivating EVERY category
--   and nulling every slug, then renames and soft-deletes the entire brand
--   library before reclaiming it. Running it to add 26 rows would rewrite the
--   whole live catalog. This migration writes only those 26 rows.
--
-- SAFETY
--   ADDITIVE and IDEMPOTENT — a single INSERT … ON CONFLICT DO UPDATE. Nothing
--   is deleted; no product, order, specification or category row is touched.
--   Safe before the rolling swap: the old code reads attributes generically and
--   simply sees more of them.
--
--   24 of the 26 ids are unused in production, so those are pure inserts. The
--   two exceptions are the canonical « Déodorants » slots 1 and 2, which
--   currently hold the stale CONSUMABLE template and are corrected in place by
--   the DO UPDATE arm. That is safe because ZERO `product_specifications` rows
--   reference either of them (read-only audit) — no seller-entered value is
--   rewritten or orphaned. The retired duplicate leaf 10304 is deliberately
--   left untouched: it is deactivated and gets no new characteristics.
--
-- NOT HAND-WRITTEN
--   The statement below is GENERATED from `prisma/taxonomy-data.ts` by
--   `prisma/scripts/taxonomy-attribute-sql.ts`, and
--   `src/common/taxonomy/taxonomy-attribute-sql.spec.ts` re-renders it on every
--   CI run and fails if this file drifts from the source of truth. Do not edit
--   the block between the BEGIN/END markers by hand — change the templates in
--   `taxonomy-data.ts` and regenerate.
--
--   One deliberate difference from `seed.ts`'s upsert: seed passes
--   `options: undefined` for a non-SELECT attribute, which tells Prisma to
--   leave the column alone; this SQL writes NULL. Writing NULL is the stricter
--   and more correct behaviour — a TEXT attribute must not keep SELECT options
--   left over from a previous template.
--
-- ROLLBACK (bottom of this file, commented) removes the 24 newly-created rows
-- and restores the two deodorant rows to the template they hold today.

-- ── product characteristics ────────────────────────────────────────────────
-- GENERATED BLOCK BEGIN — taxonomy-attribute-sql.ts, types 10601,10602,10603,10701,10702,10703,60202
INSERT INTO "product_attributes"
  ("id", "categoryId", "name", "type", "options", "isRequired", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('14000000-0000-0000-0000-000001060101', '16000000-0000-0000-0000-000000010601', 'Forme', 'SELECT'::"AttributeType", '["Poudre","Liquide","Concentré"]'::jsonb, FALSE, 1, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001060102', '16000000-0000-0000-0000-000000010601', 'Type', 'SELECT'::"AttributeType", '["Entier","Demi-écrémé","Écrémé"]'::jsonb, FALSE, 2, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001060103', '16000000-0000-0000-0000-000000010601', 'Poids / Volume', 'TEXT'::"AttributeType", NULL, FALSE, 3, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001060104', '16000000-0000-0000-0000-000000010601', 'Date d''expiration', 'TEXT'::"AttributeType", NULL, FALSE, 4, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001060201', '16000000-0000-0000-0000-000000010602', 'Forme', 'SELECT'::"AttributeType", '["Poudre","Liquide","Concentré"]'::jsonb, FALSE, 1, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001060202', '16000000-0000-0000-0000-000000010602', 'Type', 'SELECT'::"AttributeType", '["Entier","Demi-écrémé","Écrémé"]'::jsonb, FALSE, 2, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001060203', '16000000-0000-0000-0000-000000010602', 'Poids / Volume', 'TEXT'::"AttributeType", NULL, FALSE, 3, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001060204', '16000000-0000-0000-0000-000000010602', 'Date d''expiration', 'TEXT'::"AttributeType", NULL, FALSE, 4, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001060301', '16000000-0000-0000-0000-000000010603', 'Forme', 'SELECT'::"AttributeType", '["Poudre","Liquide","Concentré"]'::jsonb, FALSE, 1, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001060302', '16000000-0000-0000-0000-000000010603', 'Type', 'SELECT'::"AttributeType", '["Entier","Demi-écrémé","Écrémé"]'::jsonb, FALSE, 2, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001060303', '16000000-0000-0000-0000-000000010603', 'Poids / Volume', 'TEXT'::"AttributeType", NULL, FALSE, 3, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001060304', '16000000-0000-0000-0000-000000010603', 'Date d''expiration', 'TEXT'::"AttributeType", NULL, FALSE, 4, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001070101', '16000000-0000-0000-0000-000000010701', 'Volume', 'TEXT'::"AttributeType", NULL, FALSE, 1, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001070102', '16000000-0000-0000-0000-000000010701', 'Degré d''alcool', 'TEXT'::"AttributeType", NULL, FALSE, 2, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001070201', '16000000-0000-0000-0000-000000010702', 'Type', 'SELECT'::"AttributeType", '["Rouge","Blanc","Rosé","Pétillant"]'::jsonb, FALSE, 1, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001070202', '16000000-0000-0000-0000-000000010702', 'Volume', 'TEXT'::"AttributeType", NULL, FALSE, 2, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001070203', '16000000-0000-0000-0000-000000010702', 'Degré d''alcool', 'TEXT'::"AttributeType", NULL, FALSE, 3, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001070204', '16000000-0000-0000-0000-000000010702', 'Pays d''origine', 'TEXT'::"AttributeType", NULL, FALSE, 4, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001070301', '16000000-0000-0000-0000-000000010703', 'Type', 'SELECT'::"AttributeType", '["Whisky","Vodka","Rhum","Gin","Cognac","Liqueur"]'::jsonb, FALSE, 1, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001070302', '16000000-0000-0000-0000-000000010703', 'Volume', 'TEXT'::"AttributeType", NULL, FALSE, 2, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001070303', '16000000-0000-0000-0000-000000010703', 'Degré d''alcool', 'TEXT'::"AttributeType", NULL, FALSE, 3, NOW(), NOW()),
  ('14000000-0000-0000-0000-000001070304', '16000000-0000-0000-0000-000000010703', 'Pays d''origine', 'TEXT'::"AttributeType", NULL, FALSE, 4, NOW(), NOW()),
  ('14000000-0000-0000-0000-000006020201', '16000000-0000-0000-0000-000000060202', 'Format', 'SELECT'::"AttributeType", '["Spray","Roll-on","Stick","Crème"]'::jsonb, FALSE, 1, NOW(), NOW()),
  ('14000000-0000-0000-0000-000006020202', '16000000-0000-0000-0000-000000060202', 'Volume', 'TEXT'::"AttributeType", NULL, FALSE, 2, NOW(), NOW()),
  ('14000000-0000-0000-0000-000006020203', '16000000-0000-0000-0000-000000060202', 'Anti-transpirant', 'BOOLEAN'::"AttributeType", NULL, FALSE, 3, NOW(), NOW()),
  ('14000000-0000-0000-0000-000006020204', '16000000-0000-0000-0000-000000060202', 'Parfum', 'TEXT'::"AttributeType", NULL, FALSE, 4, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE
  SET "categoryId" = EXCLUDED."categoryId",
      "name"       = EXCLUDED."name",
      "type"       = EXCLUDED."type",
      "options"    = EXCLUDED."options",
      "isRequired" = EXCLUDED."isRequired",
      "sortOrder"  = EXCLUDED."sortOrder",
      "updatedAt"  = NOW();
-- GENERATED BLOCK END

-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (run by hand only; not part of any automatic path)
--
-- -- the 24 rows this migration created
-- DELETE FROM "product_attributes"
--  WHERE "id" IN (
--    '14000000-0000-0000-0000-000001060101', '14000000-0000-0000-0000-000001060102',
--    '14000000-0000-0000-0000-000001060103', '14000000-0000-0000-0000-000001060104',
--    '14000000-0000-0000-0000-000001060201', '14000000-0000-0000-0000-000001060202',
--    '14000000-0000-0000-0000-000001060203', '14000000-0000-0000-0000-000001060204',
--    '14000000-0000-0000-0000-000001060301', '14000000-0000-0000-0000-000001060302',
--    '14000000-0000-0000-0000-000001060303', '14000000-0000-0000-0000-000001060304',
--    '14000000-0000-0000-0000-000001070101', '14000000-0000-0000-0000-000001070102',
--    '14000000-0000-0000-0000-000001070201', '14000000-0000-0000-0000-000001070202',
--    '14000000-0000-0000-0000-000001070203', '14000000-0000-0000-0000-000001070204',
--    '14000000-0000-0000-0000-000001070301', '14000000-0000-0000-0000-000001070302',
--    '14000000-0000-0000-0000-000001070303', '14000000-0000-0000-0000-000001070304',
--    '14000000-0000-0000-0000-000006020203', '14000000-0000-0000-0000-000006020204'
--  );
--
-- -- the two pre-existing deodorant rows, back to the template they hold today
-- UPDATE "product_attributes"
--    SET "name" = 'Volume', "type" = 'TEXT'::"AttributeType", "options" = NULL,
--        "sortOrder" = 1, "updatedAt" = NOW()
--  WHERE "id" = '14000000-0000-0000-0000-000006020201';
-- UPDATE "product_attributes"
--    SET "name" = 'Date d''expiration', "type" = 'TEXT'::"AttributeType", "options" = NULL,
--        "sortOrder" = 2, "updatedAt" = NOW()
--  WHERE "id" = '14000000-0000-0000-0000-000006020202';
