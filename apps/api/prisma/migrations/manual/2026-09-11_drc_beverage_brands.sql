-- Evidence-backed DRC beverage brands (2026-09-11).
-- Initiative: docs/pre-scale-readiness.md — P2 PR C.
--
-- WHY
--   A read-only audit found 80 of 150 live leaves offering only « Autre », with
--   the sharpest gap in beverages: « Bières » had 4 brands and « Eau », « Jus »,
--   « Sodas » had none at all — in a market whose largest brewer is
--   headquartered in Lubumbashi, the launch city.
--
-- EVIDENCE — manufacturers with DRC production, not global fame
--   BRASIMBA (Castel group) — HQ Lubumbashi since 1925, production in
--     Lubumbashi, Beni and Mbuji-Mayi, 13 distribution centres.
--     Portfolio: Simba, Tembo, Castel, Beaufort Lager, 33 Export, Doppel, Skol,
--     Guinness, Chui, Booster, D'jino, XXL, World Cola, Cristal, Sankayi, Peak.
--   BRALIMA — founded 1923, three breweries INCLUDING LUBUMBASHI. Sold by
--     Heineken to Elna Holdings in April 2026; Heineken keeps the brands under
--     long-term licence: Heineken, Primus, Turbo King, Legend, Mützig. Bralima
--     also bottles the Coca-Cola range under licence.
--
--   Leaf mapping comes from the manufacturer's OWN product paths where one
--   exists, rather than being inferred:
--     brasimba.com/gamme/eau-minerale/cristalgazeuse/  → Cristal is water
--     brasimba.com/gamme/boissons-gazeuses/djino-…     → D'jino is a soda
--
-- WHAT THIS ADDS
--   15 brands: 11 beers → « Bières », Cristal → « Eau »,
--   Coca-Cola / D'jino / World Cola → « Sodas ».
--
-- WHAT IT DELIBERATELY DOES NOT ADD
--   Booster, XXL, Sankayi and Peak — portfolio members whose product category
--   could not be established from a primary source. Fanta and Sprite — the
--   source says "the Coca-Cola range" without naming them. And nothing at all
--   for Riz, Farine, Sucre, Huiles, Jus, Vins or Mode: no credible DRC brand
--   evidence exists for those, and « Autre » alone is better than guessed data.
--
-- SAFETY
--   Purely additive. Both statements are ON CONFLICT DO NOTHING, so an existing
--   brand keeps its live name, logo and sortOrder — this migration adds rows and
--   links, it never restyles the library. All 15 ids, names and slugs were
--   verified free in production. No product, order, order_item, category,
--   attribute or specification row is touched, and NO existing product has a
--   brand assigned to it: a product whose brandId is NULL stays NULL. Choosing a
--   brand for an existing listing is the seller's decision, not a migration's.
--
--   The 6 links for brands that already exist (Autre, Simba, Heineken, Primus)
--   are emitted too and are no-ops — they make the statement a complete
--   description of the intended end state rather than a delta.
--
-- NOT HAND-WRITTEN
--   Generated from `prisma/taxonomy-data.ts` by
--   `prisma/scripts/taxonomy-attribute-sql.ts` (`renderBrandSql`); the taxonomy
--   spec re-renders it in CI and fails on drift. Do not edit between the markers.
--
-- ROLLBACK at the bottom (commented).

-- ── brands + links ──────────────────────────────────────────────────────────
-- GENERATED BLOCK BEGIN — taxonomy-attribute-sql.ts renderBrandSql, leaves 10201,10203,10701, new brands 56..70
INSERT INTO "brands" ("id", "name", "slug", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('15000000-0000-0000-0000-000000000056', 'Tembo', 'tembo', TRUE, 56, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000057', 'Mützig', 'mutzig', TRUE, 57, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000058', 'Turbo King', 'turbo-king', TRUE, 58, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000059', 'Castel', 'castel', TRUE, 59, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000060', 'Skol', 'skol', TRUE, 60, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000061', '33 Export', '33-export', TRUE, 61, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000062', 'Doppel', 'doppel', TRUE, 62, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000063', 'Beaufort Lager', 'beaufort-lager', TRUE, 63, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000064', 'Legend', 'legend', TRUE, 64, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000065', 'Guinness', 'guinness', TRUE, 65, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000066', 'Chui', 'chui', TRUE, 66, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000067', 'Cristal', 'cristal', TRUE, 67, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000068', 'Coca-Cola', 'coca-cola', TRUE, 68, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000069', 'D''jino', 'd-jino', TRUE, 69, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000070', 'World Cola', 'world-cola', TRUE, 70, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "brand_categories" ("brandId", "categoryId")
VALUES
  ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010201'),  -- Autre → 10201
  ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010203'),  -- Autre → 10203
  ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010701'),  -- Autre → 10701
  ('15000000-0000-0000-0000-000000000052', '16000000-0000-0000-0000-000000010701'),  -- Simba → 10701
  ('15000000-0000-0000-0000-000000000053', '16000000-0000-0000-0000-000000010701'),  -- Heineken → 10701
  ('15000000-0000-0000-0000-000000000055', '16000000-0000-0000-0000-000000010701'),  -- Primus → 10701
  ('15000000-0000-0000-0000-000000000056', '16000000-0000-0000-0000-000000010701'),  -- Tembo → 10701
  ('15000000-0000-0000-0000-000000000057', '16000000-0000-0000-0000-000000010701'),  -- Mützig → 10701
  ('15000000-0000-0000-0000-000000000058', '16000000-0000-0000-0000-000000010701'),  -- Turbo King → 10701
  ('15000000-0000-0000-0000-000000000059', '16000000-0000-0000-0000-000000010701'),  -- Castel → 10701
  ('15000000-0000-0000-0000-000000000060', '16000000-0000-0000-0000-000000010701'),  -- Skol → 10701
  ('15000000-0000-0000-0000-000000000061', '16000000-0000-0000-0000-000000010701'),  -- 33 Export → 10701
  ('15000000-0000-0000-0000-000000000062', '16000000-0000-0000-0000-000000010701'),  -- Doppel → 10701
  ('15000000-0000-0000-0000-000000000063', '16000000-0000-0000-0000-000000010701'),  -- Beaufort Lager → 10701
  ('15000000-0000-0000-0000-000000000064', '16000000-0000-0000-0000-000000010701'),  -- Legend → 10701
  ('15000000-0000-0000-0000-000000000065', '16000000-0000-0000-0000-000000010701'),  -- Guinness → 10701
  ('15000000-0000-0000-0000-000000000066', '16000000-0000-0000-0000-000000010701'),  -- Chui → 10701
  ('15000000-0000-0000-0000-000000000067', '16000000-0000-0000-0000-000000010201'),  -- Cristal → 10201
  ('15000000-0000-0000-0000-000000000068', '16000000-0000-0000-0000-000000010203'),  -- Coca-Cola → 10203
  ('15000000-0000-0000-0000-000000000069', '16000000-0000-0000-0000-000000010203'),  -- D'jino → 10203
  ('15000000-0000-0000-0000-000000000070', '16000000-0000-0000-0000-000000010203')  -- World Cola → 10203
ON CONFLICT ("brandId", "categoryId") DO NOTHING;
-- GENERATED BLOCK END

-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (run by hand only; not part of any automatic path)
--
-- -- 1. the 15 links this migration created (the other 6 pre-existed)
-- DELETE FROM "brand_categories"
--  WHERE "brandId" IN (
--    '15000000-0000-0000-0000-000000000056','15000000-0000-0000-0000-000000000057',
--    '15000000-0000-0000-0000-000000000058','15000000-0000-0000-0000-000000000059',
--    '15000000-0000-0000-0000-000000000060','15000000-0000-0000-0000-000000000061',
--    '15000000-0000-0000-0000-000000000062','15000000-0000-0000-0000-000000000063',
--    '15000000-0000-0000-0000-000000000064','15000000-0000-0000-0000-000000000065',
--    '15000000-0000-0000-0000-000000000066','15000000-0000-0000-0000-000000000067',
--    '15000000-0000-0000-0000-000000000068','15000000-0000-0000-0000-000000000069',
--    '15000000-0000-0000-0000-000000000070'
--  );
--
-- -- 2. the 15 brand rows. Safe ONLY while no product references them; check:
-- --   SELECT "brandId", count(*) FROM "products"
-- --    WHERE "brandId" BETWEEN '15000000-0000-0000-0000-000000000056'
-- --                        AND '15000000-0000-0000-0000-000000000070'
-- --    GROUP BY "brandId";
-- -- If any row comes back, soft-delete instead of deleting:
-- --   UPDATE "brands" SET "isActive" = FALSE, "deletedAt" = NOW() WHERE "id" IN (…);
-- DELETE FROM "brands"
--  WHERE "id" BETWEEN '15000000-0000-0000-0000-000000000056'
--                 AND '15000000-0000-0000-0000-000000000070';
