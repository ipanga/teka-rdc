-- Foreign product characteristics on live products (2026-09-11).
-- Initiative: docs/pre-scale-readiness.md — P3 PR 1.
--
-- WHY
--   A read-only production audit found 18 `product_specifications` rows on 11
--   LIVE, NON-DEMO products whose attribute belongs to a DIFFERENT category
--   from the product. 17 of them render on the buyer PDP today. The worst is
--   « Type : Bière » on a Johnnie Walker whisky.
--
--   Root cause is a chain, not a bug:
--     1. The 2026-06-24 refactor REUSED category ids with new meanings, so
--        legacy attribute rows stayed attached to ids that now mean something
--        else (id …010601 was « Boissons » and is now « Lait & Produits
--        Laitiers » — which is why the whisky's Type points at milk).
--     2. Products were remapped onto the new tree; their specification rows
--        were not.
--     3. `dedupeSpecificationsByName` deliberately RENDERS foreign rows,
--        because 7 of these 11 products would otherwise show no
--        characteristics at all.
--     4. `ProductsService.update()` replaces only attributes the seller's form
--        can serve (`resolveReplaceableAttributeIds`), so a foreign row appears
--        in no form and the seller can never delete it.
--
-- WHAT THIS DOES — three buckets, decided per row, not per category
--   REPOINT (9 rows) — the value is correct and the product's own leaf has an
--     identically-named canonical attribute. The row keeps its id and its
--     seller-entered value and simply changes owner. Nothing is lost.
--   DELETE (3 rows) — the characteristic is wrong for the product:
--     « Type = Bière » on a whisky, « Nombre de feux = 2 » on a laptop, and
--     « État = Neuf », which duplicates the `ProductCondition` enum that the
--     data model says must NOT be an attribute.
--   UNTOUCHED (6 rows) — real seller data with no canonical home yet
--     (« Huile végétale », « Savon de lessive », « Blender », « Fer à sec »,
--     « Mémoire interne », and Lato's « Lait en poudre » whose value is not a
--     valid option of the target attribute). Deleting them would destroy
--     meaningful information; rehoming them needs new attributes, which is a
--     taxonomy decision, not a data fix. Left exactly as they are.
--
-- SAFETY
--   Every statement is keyed on the EXACT specification id AND its CURRENT
--   attributeId, so a row that has already been corrected, re-pointed by a
--   seller, or deleted since the audit simply does not match and nothing
--   happens. That makes this idempotent AND fail-safe: if production drifted,
--   the migration under-applies rather than touching an unexpected row.
--   Each repoint additionally refuses to run if the product already holds the
--   target attribute, which would violate the (productId, attributeId) unique
--   constraint.
--
--   No product, order, order_item, category, attribute or brand row is touched.
--   No soft-deleted product is touched. Product ids and identities are
--   untouched; only `product_specifications.attributeId` changes on 9 rows.
--
-- ROLLBACK at the bottom (commented) restores all 12 rows exactly.

-- ── 1. repoint 9 valid characteristics onto their own leaf ───────────────
-- 2mjco7  « Poids » = "10kg"   Supermarché > Alimentation → own leaf
UPDATE "product_specifications" s
   SET "attributeId" = '14000000-0000-0000-0000-000001010101', "updatedAt" = NOW()
 WHERE s."id" = '26f86d4e-58ae-45d3-987e-dfb1c6b81a6c'
   AND s."attributeId" = '14000000-0000-0000-0000-000000010101'
   AND NOT EXISTS (SELECT 1 FROM "product_specifications" x
                    WHERE x."productId" = s."productId" AND x."attributeId" = '14000000-0000-0000-0000-000001010101');

-- pocc99  « Volume » = "5L"   Supermarché > Boissons → own leaf
UPDATE "product_specifications" s
   SET "attributeId" = '14000000-0000-0000-0000-000001010701', "updatedAt" = NOW()
 WHERE s."id" = '7a41f615-ee46-4f42-bf6a-f655d60e1a45'
   AND s."attributeId" = '14000000-0000-0000-0000-000000010201'
   AND NOT EXISTS (SELECT 1 FROM "product_specifications" x
                    WHERE x."productId" = s."productId" AND x."attributeId" = '14000000-0000-0000-0000-000001010701');

-- zeohkd  « Poids » = "1kg"   Supermarché > Alimentation → own leaf
UPDATE "product_specifications" s
   SET "attributeId" = '14000000-0000-0000-0000-000001010301', "updatedAt" = NOW()
 WHERE s."id" = '720af38c-07e4-4022-9bb5-b80e2d9f8525'
   AND s."attributeId" = '14000000-0000-0000-0000-000000010101'
   AND NOT EXISTS (SELECT 1 FROM "product_specifications" x
                    WHERE x."productId" = s."productId" AND x."attributeId" = '14000000-0000-0000-0000-000001010301');

-- h0d799  « Taille » = "M"   Électroménager > Cuisine → own leaf
UPDATE "product_specifications" s
   SET "attributeId" = '14000000-0000-0000-0000-000005010201', "updatedAt" = NOW()
 WHERE s."id" = 'b11a4e88-9eb7-4e99-9a82-b8492a85f361'
   AND s."attributeId" = '14000000-0000-0000-0000-000000040101'
   AND NOT EXISTS (SELECT 1 FROM "product_specifications" x
                    WHERE x."productId" = s."productId" AND x."attributeId" = '14000000-0000-0000-0000-000005010201');

-- h0d799  « Matière » = "Coton"   Électroménager > Cuisine → own leaf
UPDATE "product_specifications" s
   SET "attributeId" = '14000000-0000-0000-0000-000005010203', "updatedAt" = NOW()
 WHERE s."id" = '407dffe3-2dc7-42d2-adf3-ab9275b1156d'
   AND s."attributeId" = '14000000-0000-0000-0000-000000040103'
   AND NOT EXISTS (SELECT 1 FROM "product_specifications" x
                    WHERE x."productId" = s."productId" AND x."attributeId" = '14000000-0000-0000-0000-000005010203');

-- h0d799  « Couleur » = "Bleu"   Électroménager > Cuisine → own leaf
UPDATE "product_specifications" s
   SET "attributeId" = '14000000-0000-0000-0000-000005010202', "updatedAt" = NOW()
 WHERE s."id" = 'ae6d1d9e-a100-4954-bed6-e5806a5e0e4a'
   AND s."attributeId" = '14000000-0000-0000-0000-000000040102'
   AND NOT EXISTS (SELECT 1 FROM "product_specifications" x
                    WHERE x."productId" = s."productId" AND x."attributeId" = '14000000-0000-0000-0000-000005010202');

-- foyug0  « RAM » = "4Go"   Téléphones & Accessoires > Smartphones → own leaf
UPDATE "product_specifications" s
   SET "attributeId" = '14000000-0000-0000-0000-000002010102', "updatedAt" = NOW()
 WHERE s."id" = '4bd4551d-eb86-46e5-bf14-00bba1b3bc1f'
   AND s."attributeId" = '14000000-0000-0000-0000-000000020103'
   AND NOT EXISTS (SELECT 1 FROM "product_specifications" x
                    WHERE x."productId" = s."productId" AND x."attributeId" = '14000000-0000-0000-0000-000002010102');

-- rb7t4r  « Volume » = "1L"   Supermarché > Lait & Produits Laitiers → own leaf
UPDATE "product_specifications" s
   SET "attributeId" = '14000000-0000-0000-0000-000001070302', "updatedAt" = NOW()
 WHERE s."id" = '671d6e6a-7f8e-467e-9a75-a6362c57d6f1'
   AND s."attributeId" = '14000000-0000-0000-0000-000000010602'
   AND NOT EXISTS (SELECT 1 FROM "product_specifications" x
                    WHERE x."productId" = s."productId" AND x."attributeId" = '14000000-0000-0000-0000-000001070302');

-- d3k7ei  « Puissance » = "1000W"   Électronique > Mixeurs & Blenders → own leaf
UPDATE "product_specifications" s
   SET "attributeId" = '14000000-0000-0000-0000-000004010102', "updatedAt" = NOW()
 WHERE s."id" = 'fae0b1c5-8d6e-4ab7-8666-228f18eb1383'
   AND s."attributeId" = '14000000-0000-0000-0000-000000030802'
   AND NOT EXISTS (SELECT 1 FROM "product_specifications" x
                    WHERE x."productId" = s."productId" AND x."attributeId" = '14000000-0000-0000-0000-000004010102');

-- ── 2. delete 3 characteristics that are wrong for the product ───────────
-- wft1y8  « Nombre de feux » = "2"
-- foyug0  « État » = "Neuf"
-- rb7t4r  « Type » = "Bière"
DELETE FROM "product_specifications"
 WHERE ("id", "attributeId") IN (
   ('be4aed2c-e8e0-42dd-8a49-747358a1d167', '14000000-0000-0000-0000-000000030202'),
   ('5c909c6d-39f6-4bf6-b228-02a7fa0878d1', '14000000-0000-0000-0000-000000020105'),
   ('81e85bf9-e075-48ad-b456-51617c198afa', '14000000-0000-0000-0000-000000010601')
 );
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (run by hand only; not part of any automatic path)
--
-- -- 1. put the 9 repointed rows back on their original attribute
-- UPDATE "product_specifications" SET "attributeId" = '14000000-0000-0000-0000-000000010101'
--  WHERE "id" = '26f86d4e-58ae-45d3-987e-dfb1c6b81a6c';   -- 2mjco7 « Poids »
-- UPDATE "product_specifications" SET "attributeId" = '14000000-0000-0000-0000-000000010201'
--  WHERE "id" = '7a41f615-ee46-4f42-bf6a-f655d60e1a45';   -- pocc99 « Volume »
-- UPDATE "product_specifications" SET "attributeId" = '14000000-0000-0000-0000-000000010101'
--  WHERE "id" = '720af38c-07e4-4022-9bb5-b80e2d9f8525';   -- zeohkd « Poids »
-- UPDATE "product_specifications" SET "attributeId" = '14000000-0000-0000-0000-000000040101'
--  WHERE "id" = 'b11a4e88-9eb7-4e99-9a82-b8492a85f361';   -- h0d799 « Taille »
-- UPDATE "product_specifications" SET "attributeId" = '14000000-0000-0000-0000-000000040103'
--  WHERE "id" = '407dffe3-2dc7-42d2-adf3-ab9275b1156d';   -- h0d799 « Matière »
-- UPDATE "product_specifications" SET "attributeId" = '14000000-0000-0000-0000-000000040102'
--  WHERE "id" = 'ae6d1d9e-a100-4954-bed6-e5806a5e0e4a';   -- h0d799 « Couleur »
-- UPDATE "product_specifications" SET "attributeId" = '14000000-0000-0000-0000-000000020103'
--  WHERE "id" = '4bd4551d-eb86-46e5-bf14-00bba1b3bc1f';   -- foyug0 « RAM »
-- UPDATE "product_specifications" SET "attributeId" = '14000000-0000-0000-0000-000000010602'
--  WHERE "id" = '671d6e6a-7f8e-467e-9a75-a6362c57d6f1';   -- rb7t4r « Volume »
-- UPDATE "product_specifications" SET "attributeId" = '14000000-0000-0000-0000-000000030802'
--  WHERE "id" = 'fae0b1c5-8d6e-4ab7-8666-228f18eb1383';   -- d3k7ei « Puissance »
--
-- -- 2. restore the 3 deleted rows. Values are recorded here because the rows
-- --    themselves are gone; ids are preserved so history stays stable.
-- INSERT INTO "product_specifications" ("id", "productId", "attributeId", "value", "createdAt", "updatedAt")
-- SELECT 'be4aed2c-e8e0-42dd-8a49-747358a1d167', p."id", '14000000-0000-0000-0000-000000030202', '2', NOW(), NOW()
--   FROM "products" p WHERE p."shortCode" = 'wft1y8'
-- ON CONFLICT DO NOTHING;
-- INSERT INTO "product_specifications" ("id", "productId", "attributeId", "value", "createdAt", "updatedAt")
-- SELECT '5c909c6d-39f6-4bf6-b228-02a7fa0878d1', p."id", '14000000-0000-0000-0000-000000020105', 'Neuf', NOW(), NOW()
--   FROM "products" p WHERE p."shortCode" = 'foyug0'
-- ON CONFLICT DO NOTHING;
-- INSERT INTO "product_specifications" ("id", "productId", "attributeId", "value", "createdAt", "updatedAt")
-- SELECT '81e85bf9-e075-48ad-b456-51617c198afa', p."id", '14000000-0000-0000-0000-000000010601', 'Bière', NOW(), NOW()
--   FROM "products" p WHERE p."shortCode" = 'rb7t4r'
-- ON CONFLICT DO NOTHING;
