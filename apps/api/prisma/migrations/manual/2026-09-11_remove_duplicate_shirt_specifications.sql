-- Remove three duplicate characteristics from one product (2026-09-11).
-- Initiative: docs/pre-scale-readiness.md — P3-2.
--
-- WHY
--   The shirt « Lot de 2 chemises de bureau pour homme » (shortCode h0d799)
--   carries SIX specifications where it should carry three. Its own leaf
--   « Mode > Homme > Chemises » declares Taille, Couleur and Matière, and the
--   product has all three — but it ALSO still carries three rows from before
--   the 2026-06-24 refactor, pointing at attributes that now belong to
--   « Électroménager > Cuisine » because that category id was reused.
--
--   The 2026-09-11 correction could not repoint them: the canonical rows
--   already existed, so the unique (productId, attributeId) constraint refused
--   it. The guard behaved correctly and left them in place.
--
--   They are invisible — `dedupeSpecificationsByName` prefers the own-category
--   row, so the PDP renders exactly three characteristics — but they are also
--   unreachable: no seller form serves them, so nobody can remove them.
--
-- WHY DELETING THEM LOSES NOTHING
--   Verified read-only against production immediately before generating this
--   file. Each duplicate's value is BYTE-EQUAL to its canonical twin:
--
--     « Taille »  = "M"      ↔ canonical … = "M"
--     « Matière » = "Coton"  ↔ canonical … = "Coton"
--     « Couleur » = "Bleu"   ↔ canonical … = "Bleu"
--
--   Each DELETE additionally refuses to run unless the canonical replacement is
--   STILL PRESENT with the identical value. The row may only go if nothing is
--   lost by its going — that is a property of the statement, not of the moment
--   it was written.
--
-- SCOPE — deliberately narrow
--   Three `product_specifications` rows. The legacy ATTRIBUTE rows they point
--   at are NOT deleted: other products' history still references them, and
--   retiring them is separate work. No product, category, brand, order or
--   order_item row is touched. The three unresolved Group B characteristics
--   (oil « Type », « Mémoire interne », iron « Type ») are NOT touched — those
--   hold real seller data with no canonical home and are reserved for P3-4.
--   The 117 + 2 intentionally preserved historical rows are NOT touched.
--
-- SAFETY
--   Keyed on id AND productId AND attributeId AND value, so a row edited,
--   repointed or already removed simply does not match. Idempotent: a second
--   run deletes nothing because the rows are gone.
--
-- EXPECTED EFFECT
--   product_specifications: −3 (347 → 344 at time of writing)
--   everything else ........ unchanged
--   the shirt keeps Taille=M, Couleur=Bleu, Matière=Coton — rendered exactly
--   once each, as it already is today.
--
-- ROLLBACK at the bottom restores the three rows with their original ids.

-- ── the three duplicates ────────────────────────────────────────────────────
-- « Taille » = "M"  duplicate of canonical spec d5297359-3ca0-42e3-9573-d4728adfd0a7
DELETE FROM "product_specifications" d
 WHERE d."id"          = 'b11a4e88-9eb7-4e99-9a82-b8492a85f361'
   AND d."productId"   = '1a07d699-f9d5-42da-aa23-b999bc84ef37'
   AND d."attributeId" = '14000000-0000-0000-0000-000000040101'
   AND d."value"       = 'M'
   -- refuse unless the canonical replacement is still present with the
   -- identical value: the row may only go if nothing is lost by its going.
   AND EXISTS (
     SELECT 1 FROM "product_specifications" k
      WHERE k."id"          = 'd5297359-3ca0-42e3-9573-d4728adfd0a7'
        AND k."productId"   = d."productId"
        AND k."attributeId" = '14000000-0000-0000-0000-000005010201'
        AND k."value"       = d."value"
   );

-- « Matière » = "Coton"  duplicate of canonical spec 9b4f8a64-8df9-45f2-b907-6dad4d222d03
DELETE FROM "product_specifications" d
 WHERE d."id"          = '407dffe3-2dc7-42d2-adf3-ab9275b1156d'
   AND d."productId"   = '1a07d699-f9d5-42da-aa23-b999bc84ef37'
   AND d."attributeId" = '14000000-0000-0000-0000-000000040103'
   AND d."value"       = 'Coton'
   -- refuse unless the canonical replacement is still present with the
   -- identical value: the row may only go if nothing is lost by its going.
   AND EXISTS (
     SELECT 1 FROM "product_specifications" k
      WHERE k."id"          = '9b4f8a64-8df9-45f2-b907-6dad4d222d03'
        AND k."productId"   = d."productId"
        AND k."attributeId" = '14000000-0000-0000-0000-000005010203'
        AND k."value"       = d."value"
   );

-- « Couleur » = "Bleu"  duplicate of canonical spec 5ad9991a-1672-4d86-8bdb-09ebb0dae532
DELETE FROM "product_specifications" d
 WHERE d."id"          = 'ae6d1d9e-a100-4954-bed6-e5806a5e0e4a'
   AND d."productId"   = '1a07d699-f9d5-42da-aa23-b999bc84ef37'
   AND d."attributeId" = '14000000-0000-0000-0000-000000040102'
   AND d."value"       = 'Bleu'
   -- refuse unless the canonical replacement is still present with the
   -- identical value: the row may only go if nothing is lost by its going.
   AND EXISTS (
     SELECT 1 FROM "product_specifications" k
      WHERE k."id"          = '5ad9991a-1672-4d86-8bdb-09ebb0dae532'
        AND k."productId"   = d."productId"
        AND k."attributeId" = '14000000-0000-0000-0000-000005010202'
        AND k."value"       = d."value"
   );
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (run by hand only; not part of any automatic path)
--
-- -- restore the three removed duplicates, exactly as they were
-- INSERT INTO "product_specifications" ("id", "productId", "attributeId", "value", "createdAt", "updatedAt")
-- VALUES ('b11a4e88-9eb7-4e99-9a82-b8492a85f361', '1a07d699-f9d5-42da-aa23-b999bc84ef37', '14000000-0000-0000-0000-000000040101', 'M', NOW(), NOW())
-- ON CONFLICT DO NOTHING;
-- INSERT INTO "product_specifications" ("id", "productId", "attributeId", "value", "createdAt", "updatedAt")
-- VALUES ('407dffe3-2dc7-42d2-adf3-ab9275b1156d', '1a07d699-f9d5-42da-aa23-b999bc84ef37', '14000000-0000-0000-0000-000000040103', 'Coton', NOW(), NOW())
-- ON CONFLICT DO NOTHING;
-- INSERT INTO "product_specifications" ("id", "productId", "attributeId", "value", "createdAt", "updatedAt")
-- VALUES ('ae6d1d9e-a100-4954-bed6-e5806a5e0e4a', '1a07d699-f9d5-42da-aa23-b999bc84ef37', '14000000-0000-0000-0000-000000040102', 'Bleu', NOW(), NOW())
-- ON CONFLICT DO NOTHING;