-- P3-4c — give « Fers à repasser » its canonical « Type » (2026-09-11).
-- Initiative: docs/pre-scale-readiness.md — P3-4c.
--
-- WHY
--   The ACTIVE product vibk3l « Fer à repasser sec Pixel 1000 W » sits on the
--   LEAF « Électroménager > Entretien Maison > Fers à repasser » and carries a
--   single characteristic, « Type » = "Fer à sec". That characteristic is owned
--   by 14000000-…-000000030501, which hangs off the INTERMEDIATE node
--   « Électronique > Réseau & Internet » (Routeurs, Modems, Répéteurs WiFi) —
--   another 2026-06-24 id reuse.
--
--   A read-only production check on 2026-09-11 proved the consequence:
--
--     buyer PDP   → shows « Type : Fer à sec »
--     seller form → offers « Puissance », « Garantie » and NOTHING ELSE
--
--   So the seller cannot see, edit or remove a value buyers can read.
--
--   No canonical equivalent existed: a search of every attribute and category
--   found the misplaced row to be the ONLY thing in the database mentioning any
--   ironing term. `taxonomy-data.ts` therefore gains a dedicated IRON template
--   declaring « Type » for leaf 40501, and this migration materialises it.
--
-- WHY A DEDICATED TEMPLATE
--   « Type » is NOT appended to APP_GENERIC: that template is shared with
--   « Aspirateurs », so appending there would offer a vacuum cleaner
--   « Fer à vapeur ». IRON is the same pattern PRINTER, FRIDGE, WASHER and FAN
--   already use. « Type » is appended LAST because attribute ids are positional,
--   so the live « Puissance » …4050101 and « Garantie » …4050102 keep their ids
--   and the new row takes the free …4050103.
--
-- WHAT THIS DOES
--   1. Creates the canonical « Type » on the « Fers à repasser » LEAF.
--   2. Repoints vibk3l's single specification onto it — same row id, same value.
--   3. Re-homes the legacy misplaced attribute onto the existing holding
--      category, the convention P2 PR B established.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   NOTHING IS DELETED. The legacy attribute keeps its id. No category is
--   created — « Repassage » and « Défroisseurs » are a separate catalogue
--   question, explicitly out of scope. No product, order, brand or unrelated
--   attribute is touched, and the 117 + 2 preserved rows are untouched.
--
-- SAFETY — REFUSAL FIRST
--   One atomic DO block, three branches: already applied → NOTICE; exactly the
--   reviewed pre-state → apply; anything else → RAISE EXCEPTION with no write.
--   Every row is addressed by EXACT id AND expected current value, and no
--   statement matches on an attribute NAME — « Type » exists on a dozen leaves,
--   so a name-keyed migration here would be catastrophic.
--
-- EXPECTED EFFECT
--   product_attributes ........... 584 → 585 (one created; nothing deleted)
--   product_specifications ....... 344 → 344 (repoint only; no row added/removed)
--   categories / products / brands / orders / order_items ... unchanged
--   holding category attributes .. 50 → 51
--   attributes on live intermediate nodes ... 2 → 1
--   taxonomy:diff judgement ...... 2 → 1
--   buyer PDP for vibk3l ......... « Type : Fer à sec » — same label, same value
--   seller form for Fers à repasser ... gains « Type », PRE-FILLED and editable
--   seller form for Aspirateurs ....... UNCHANGED (Puissance, Garantie)
--
-- ROLLBACK at the bottom. Read its note on the created row before using it.

DO $$
DECLARE
  v_spec      CONSTANT uuid := '7476a834-8ca6-423d-94b6-f1e9e6bc3f4b';
  v_product   CONSTANT uuid := 'c7417108-3d26-4832-8a88-a5e6fd8baf7f'; -- vibk3l
  v_old_attr  CONSTANT uuid := '14000000-0000-0000-0000-000000030501'; -- legacy « Type »
  v_new_attr  CONSTANT uuid := '14000000-0000-0000-0000-000004050103'; -- canonical « Type »
  v_old_home  CONSTANT uuid := '13000000-0000-0000-0000-000000000305'; -- Réseau & Internet
  v_leaf      CONSTANT uuid := '16000000-0000-0000-0000-000000040501'; -- Fers à repasser
  v_holding   CONSTANT uuid := '13000000-0000-0000-0000-000000000999';
  v_value     CONSTANT text := 'Fer à sec';
  v_options   CONSTANT jsonb := '["Fer à sec","Fer à vapeur","Centrale vapeur","Défroisseur"]'::jsonb;

  v_points_old int;
  v_points_new int;
  v_collision  int;
  v_attr_home  uuid;
  v_leaf_ok    int;
BEGIN
  -- The destination LEAF must exist and still be a leaf: creating a
  -- characteristic on a node with children would be invisible and would
  -- immediately violate taxonomy invariant 1.
  SELECT count(*) INTO v_leaf_ok FROM "categories" c
   WHERE c."id" = v_leaf AND c."deletedAt" IS NULL AND c."isActive"
     AND NOT EXISTS (SELECT 1 FROM "categories" k WHERE k."parentCategoryId" = c."id" AND k."deletedAt" IS NULL);
  IF v_leaf_ok <> 1 THEN
    RAISE EXCEPTION 'P3-4c REFUSED: « Fers à repasser » % is missing, inactive, deleted or no longer a leaf.', v_leaf;
  END IF;

  SELECT count(*) INTO v_points_old FROM "product_specifications"
   WHERE "id" = v_spec AND "productId" = v_product AND "attributeId" = v_old_attr AND "value" = v_value;
  SELECT count(*) INTO v_points_new FROM "product_specifications"
   WHERE "id" = v_spec AND "productId" = v_product AND "attributeId" = v_new_attr AND "value" = v_value;
  SELECT "categoryId" INTO v_attr_home FROM "product_attributes" WHERE "id" = v_old_attr;

  -- ── branch 1: already applied ────────────────────────────────────────────
  IF v_points_new = 1 AND v_attr_home = v_holding THEN
    RAISE NOTICE 'P3-4c already applied — specification % already points at the canonical « Type » and the legacy attribute is already retired. Nothing to do.', v_spec;
    RETURN;
  END IF;

  -- ── branch 3: anything other than the reviewed pre-state ─────────────────
  IF v_points_old <> 1 THEN
    RAISE EXCEPTION 'P3-4c REFUSED: specification % is not in the reviewed state (expected productId=%, attributeId=%, value="%"). Production has drifted; re-audit before applying.',
      v_spec, v_product, v_old_attr, v_value;
  END IF;
  IF v_attr_home <> v_old_home THEN
    RAISE EXCEPTION 'P3-4c REFUSED: legacy attribute % is on category % but the reviewed state expects %. Production has drifted; re-audit before applying.',
      v_old_attr, v_attr_home, v_old_home;
  END IF;

  SELECT count(*) INTO v_collision FROM "product_specifications"
   WHERE "productId" = v_product AND "attributeId" = v_new_attr;
  IF v_collision <> 0 THEN
    RAISE EXCEPTION 'P3-4c REFUSED: product % already holds a canonical « Type » specification. Repointing would violate the (productId, attributeId) unique constraint and could lose a seller value. Resolve by hand.', v_product;
  END IF;

  -- ── branch 2: apply ──────────────────────────────────────────────────────
  -- 1. materialise the canonical characteristic the source now declares.
  INSERT INTO "product_attributes" ("id", "categoryId", "name", "type", "options", "isRequired", "sortOrder", "createdAt", "updatedAt")
  VALUES (v_new_attr, v_leaf, 'Type', 'SELECT', v_options, FALSE, 3, NOW(), NOW())
  ON CONFLICT ("id") DO NOTHING;

  -- 2. repoint the live specification. The row keeps its id and its value;
  --    only its owner changes, so no seller-entered data is rewritten.
  UPDATE "product_specifications"
     SET "attributeId" = v_new_attr, "updatedAt" = NOW()
   WHERE "id" = v_spec AND "productId" = v_product AND "attributeId" = v_old_attr AND "value" = v_value;

  -- 3. retire the legacy attribute onto the existing holding category.
  UPDATE "product_attributes"
     SET "categoryId" = v_holding, "updatedAt" = NOW()
   WHERE "id" = v_old_attr AND "categoryId" = v_old_home;

  -- ── post-conditions: abort the whole block if the end state is not exact ─
  IF (SELECT count(*) FROM "product_attributes"
       WHERE "id" = v_new_attr AND "categoryId" = v_leaf AND "name" = 'Type' AND "options" = v_options) <> 1 THEN
    RAISE EXCEPTION 'P3-4c ABORTED: the canonical « Type » is not on the « Fers à repasser » leaf with the expected options.';
  END IF;
  IF (SELECT count(*) FROM "product_specifications"
       WHERE "id" = v_spec AND "attributeId" = v_new_attr AND "value" = v_value) <> 1 THEN
    RAISE EXCEPTION 'P3-4c ABORTED: the repointed specification is not in the expected end state.';
  END IF;
  IF (SELECT count(*) FROM "product_specifications" WHERE "productId" = v_product AND "attributeId" = v_new_attr) <> 1 THEN
    RAISE EXCEPTION 'P3-4c ABORTED: product % would hold more than one canonical « Type » specification.', v_product;
  END IF;
  IF (SELECT "categoryId" FROM "product_attributes" WHERE "id" = v_old_attr) <> v_holding THEN
    RAISE EXCEPTION 'P3-4c ABORTED: the legacy « Type » was not retired onto the holding category.';
  END IF;
  IF (SELECT count(*) FROM "product_attributes" WHERE "categoryId" = '16000000-0000-0000-0000-000000040502') <> 2 THEN
    RAISE EXCEPTION 'P3-4c ABORTED: « Aspirateurs » no longer carries exactly its two characteristics — the new « Type » must never reach it.';
  END IF;

  RAISE NOTICE 'P3-4c applied: canonical « Type » created on « Fers à repasser »; specification % repointed with value "%" preserved; legacy « Type » retired.', v_spec, v_value;
END $$;

-- ── ROLLBACK (manual, not executed) ──────────────────────────────────────────
-- THREE DISTINCT LEVELS — do not confuse them:
--
--   A. DATABASE MIGRATION ROLLBACK (the two UPDATEs below).
--      Restores the specification's owner and the legacy attribute's category.
--      This alone is enough to undo the user-visible effect.
--
--   B. CODE / DECLARATION ROLLBACK (revert the IRON template in
--      taxonomy-data.ts). Needed only if the canonical row must disappear.
--
--   DO NOT DELETE the created attribute while the declaration stands.
--   `taxonomy-data.ts` would still declare it, so `taxonomy:diff` would report
--   it as DRIFT_ADDITIVE `attribute.missing` and `taxonomy:apply` would
--   regenerate it — leaving code and database silently inconsistent. Delete the
--   row ONLY together with level B, and only once nothing references it.
--
--   C. FULL RELEASE ROLLBACK — revert the release merge on `main` and redeploy.
--      That performs B and leaves the database to A.
--
-- A — database rollback:
-- UPDATE "product_specifications"
--    SET "attributeId" = '14000000-0000-0000-0000-000000030501', "updatedAt" = NOW()
--  WHERE "id" = '7476a834-8ca6-423d-94b6-f1e9e6bc3f4b'
--    AND "attributeId" = '14000000-0000-0000-0000-000004050103';
--
-- UPDATE "product_attributes"
--    SET "categoryId" = '13000000-0000-0000-0000-000000000305', "updatedAt" = NOW()
--  WHERE "id" = '14000000-0000-0000-0000-000000030501'
--    AND "categoryId" = '13000000-0000-0000-0000-000000000999';
--
-- B — only WITH the taxonomy-data.ts revert, and only if unreferenced:
-- DELETE FROM "product_attributes" WHERE "id" = '14000000-0000-0000-0000-000004050103'
--   AND NOT EXISTS (SELECT 1 FROM "product_specifications" WHERE "attributeId" = '14000000-0000-0000-0000-000004050103');
