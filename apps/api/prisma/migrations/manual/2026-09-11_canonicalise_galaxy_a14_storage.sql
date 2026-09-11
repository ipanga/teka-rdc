-- P3-4a — canonicalise the Galaxy A14 storage characteristic (2026-09-11).
-- Initiative: docs/pre-scale-readiness.md — P3-4a.
--
-- WHY
--   « Mémoire interne » (14000000-…-000000020102) sits on the INTERMEDIATE node
--   « Téléphones & Accessoires > Smartphones ». The canonical source declares no
--   such characteristic: the smartphone leaves carry « Stockage » (the STORAGE
--   template in taxonomy-data.ts) with a BYTE-IDENTICAL option list. So
--   « Mémoire interne » is a differently-named duplicate of « Stockage »,
--   stranded on a parent node by the 2026-06-24 id reuse.
--
--   One LIVE product depends on it: foyug0 « Samsung Galaxy A14 », which sits on
--   the « Android » LEAF and stores "16Go". A read-only production check on
--   2026-09-11 proved the consequence:
--
--     buyer PDP        → shows « Mémoire interne : 16Go »
--     seller form      → offers « Stockage » (EMPTY) and never « Mémoire interne »
--
--   The seller therefore cannot see, edit, or remove a value the buyer can read.
--   Worse, the two labels differ, and `dedupeSpecificationsByName` collapses
--   characteristics by NAME: the moment that seller fills in « Stockage », the
--   PDP renders BOTH rows — exactly the duplicate-display defect P3-2 removed
--   from the shirt h0d799.
--
-- WHAT THIS DOES
--   1. Repoints the single live specification onto the canonical « Stockage »
--      attribute of the « Android » leaf, keeping its id and its value.
--   2. Re-homes the now-legacy « Mémoire interne » attribute onto the existing
--      retired holding category, the same convention P2 PR B established for 46
--      other stranded characteristics.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Nothing is deleted. The attribute keeps its id, so its FOUR historical
--   specifications on SOFT-DELETED products (841f14, c972d9, 34afaa, 8f3d81 —
--   "128Go", "64Go", "128Go", "64Go") keep a valid foreign key and still resolve
--   the characteristic they were listed with. No product, order, order_item,
--   brand, category or other specification row is touched. The 117 + 2 preserved
--   legacy rows are out of scope and untouched.
--
-- SAFETY — REFUSAL FIRST
--   The whole change runs inside ONE atomic DO block with three branches:
--     • already applied      → NOTICE, no write (idempotent re-run)
--     • exactly the reviewed pre-state → apply
--     • anything else        → RAISE EXCEPTION, no write
--   Every row is addressed by its EXACT id and its EXACT expected current value.
--   No statement matches on an attribute NAME, so the target can never broaden.
--
-- EXPECTED EFFECT
--   product_specifications ......... unchanged (344) — one row's attributeId moves
--   product_attributes ............. unchanged (584) — nothing created or deleted
--   categories / products / brands / orders / order_items ... unchanged
--   attributes on the holding category ....... 46 → 47
--   attributes on live intermediate nodes .... 6 → 5
--   buyer PDP for foyug0 ..... « Stockage : 16Go » (canonical label, same value)
--   seller form for Android .. « Stockage » now PRE-FILLED with 16Go and editable
--
-- ROLLBACK at the bottom restores both rows exactly.

DO $$
DECLARE
  v_spec      CONSTANT uuid := '600d7c1c-c1cd-4c8d-ba15-e6502620fc4e';
  v_product   CONSTANT uuid := '40d364cd-4f6d-44f6-ac62-d44b28c1840e'; -- foyug0
  v_old_attr  CONSTANT uuid := '14000000-0000-0000-0000-000000020102'; -- « Mémoire interne »
  v_new_attr  CONSTANT uuid := '14000000-0000-0000-0000-000002010103'; -- « Stockage » (Android)
  v_old_home  CONSTANT uuid := '13000000-0000-0000-0000-000000000201'; -- Smartphones (intermediate)
  v_android   CONSTANT uuid := '16000000-0000-0000-0000-000000020101'; -- Android (leaf)
  v_holding   CONSTANT uuid := '13000000-0000-0000-0000-000000000999'; -- retired holder
  v_value     CONSTANT text := '16Go';

  v_points_old  int;
  v_points_new  int;
  v_collision   int;
  v_attr_home   uuid;
  v_target_ok   int;
BEGIN
  SELECT count(*) INTO v_points_old FROM "product_specifications"
   WHERE "id" = v_spec AND "productId" = v_product AND "attributeId" = v_old_attr AND "value" = v_value;
  SELECT count(*) INTO v_points_new FROM "product_specifications"
   WHERE "id" = v_spec AND "productId" = v_product AND "attributeId" = v_new_attr AND "value" = v_value;
  SELECT "categoryId" INTO v_attr_home FROM "product_attributes" WHERE "id" = v_old_attr;

  -- The canonical destination must exist, on the Android LEAF, and accept the value.
  SELECT count(*) INTO v_target_ok FROM "product_attributes"
   WHERE "id" = v_new_attr AND "categoryId" = v_android
     AND "options" @> to_jsonb(v_value);
  IF v_target_ok <> 1 THEN
    RAISE EXCEPTION 'P3-4a REFUSED: canonical « Stockage » % is missing from the Android leaf, or does not offer the option "%"', v_new_attr, v_value;
  END IF;

  -- ── branch 1: already applied ────────────────────────────────────────────
  IF v_points_new = 1 AND v_attr_home = v_holding THEN
    RAISE NOTICE 'P3-4a already applied — specification % already points at « Stockage » and « Mémoire interne » is already retired. Nothing to do.', v_spec;
    RETURN;
  END IF;

  -- ── branch 3: anything other than the reviewed pre-state ─────────────────
  IF v_points_old <> 1 THEN
    RAISE EXCEPTION 'P3-4a REFUSED: specification % is not in the reviewed state (expected productId=%, attributeId=%, value="%"). Production has drifted; re-audit before applying.',
      v_spec, v_product, v_old_attr, v_value;
  END IF;
  IF v_attr_home <> v_old_home THEN
    RAISE EXCEPTION 'P3-4a REFUSED: attribute % is on category % but the reviewed state expects %. Production has drifted; re-audit before applying.',
      v_old_attr, v_attr_home, v_old_home;
  END IF;

  SELECT count(*) INTO v_collision FROM "product_specifications"
   WHERE "productId" = v_product AND "attributeId" = v_new_attr;
  IF v_collision <> 0 THEN
    RAISE EXCEPTION 'P3-4a REFUSED: product % already holds a « Stockage » specification. Repointing would violate the (productId, attributeId) unique constraint and could lose a seller value. Resolve by hand.', v_product;
  END IF;

  -- ── branch 2: apply ──────────────────────────────────────────────────────
  -- 1. repoint the live specification. The row keeps its id and its value; only
  --    its owner changes, so no seller-entered data is rewritten.
  UPDATE "product_specifications"
     SET "attributeId" = v_new_attr, "updatedAt" = NOW()
   WHERE "id" = v_spec AND "productId" = v_product AND "attributeId" = v_old_attr AND "value" = v_value;

  -- 2. retire the legacy attribute onto the existing holding category. Its four
  --    historical specifications follow it and remain resolvable.
  UPDATE "product_attributes"
     SET "categoryId" = v_holding, "updatedAt" = NOW()
   WHERE "id" = v_old_attr AND "categoryId" = v_old_home;

  -- ── post-conditions: refuse the whole block if the end state is not exact ─
  IF (SELECT count(*) FROM "product_specifications"
       WHERE "id" = v_spec AND "attributeId" = v_new_attr AND "value" = v_value) <> 1 THEN
    RAISE EXCEPTION 'P3-4a ABORTED: the repointed specification is not in the expected end state.';
  END IF;
  IF (SELECT count(*) FROM "product_specifications"
       WHERE "productId" = v_product AND "attributeId" = v_new_attr) <> 1 THEN
    RAISE EXCEPTION 'P3-4a ABORTED: product % would hold more than one « Stockage » specification.', v_product;
  END IF;
  IF (SELECT "categoryId" FROM "product_attributes" WHERE "id" = v_old_attr) <> v_holding THEN
    RAISE EXCEPTION 'P3-4a ABORTED: « Mémoire interne » was not retired onto the holding category.';
  END IF;
  IF (SELECT count(*) FROM "product_specifications" WHERE "attributeId" = v_old_attr) <> 4 THEN
    RAISE EXCEPTION 'P3-4a ABORTED: the four historical specifications of « Mémoire interne » are no longer intact.';
  END IF;

  RAISE NOTICE 'P3-4a applied: specification % repointed to « Stockage » with value "%" preserved; « Mémoire interne » retired with its 4 historical specifications intact.', v_spec, v_value;
END $$;

-- ── ROLLBACK (manual, not executed) ──────────────────────────────────────────
-- Restores both rows exactly. Nothing was deleted, so this is a complete undo.
--
-- UPDATE "product_specifications"
--    SET "attributeId" = '14000000-0000-0000-0000-000000020102', "updatedAt" = NOW()
--  WHERE "id" = '600d7c1c-c1cd-4c8d-ba15-e6502620fc4e'
--    AND "attributeId" = '14000000-0000-0000-0000-000002010103';
--
-- UPDATE "product_attributes"
--    SET "categoryId" = '13000000-0000-0000-0000-000000000201', "updatedAt" = NOW()
--  WHERE "id" = '14000000-0000-0000-0000-000000020102'
--    AND "categoryId" = '13000000-0000-0000-0000-000000000999';
