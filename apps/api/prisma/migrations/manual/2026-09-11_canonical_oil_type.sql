-- P3-4d — give « Huiles » its canonical « Type » (2026-09-11).
-- Initiative: docs/pre-scale-readiness.md — P3-4d. The last of the P3 series.
--
-- WHY
--   The ACTIVE product pocc99 « Huile de cuisson Star Fry 5 litres » sits on the
--   LEAF « Supermarché > Alimentation > Huiles » and carries « Type » =
--   "Huile végétale". That characteristic is owned by 14000000-…-000000010202,
--   which hangs off the INTERMEDIATE node « Supermarché > Boissons » (Eau, Jus,
--   Sodas, Café, Thé, Boissons énergétiques) — the last surviving 2026-06-24 id
--   reuse.
--
--   A read-only production check on 2026-09-11 proved the consequence:
--
--     buyer PDP   → shows « Type : Huile végétale » and « Volume : 5L »
--     seller form → offers « Volume » and « Date d'expiration » ONLY
--
--   So the seller cannot see, edit or remove a value buyers can read.
--
-- THE OPTION LIST IS DELIBERATELY NARROWER THAN THE LEGACY ONE
--   The legacy attribute offers
--     Huile végétale, Huile d'olive, Huile de palme, Vinaigre, Sel, Épices, Sauce
--   Only the first three are oil types. Vinaigre / Sel / Épices / Sauce are
--   separate product families — and Teka already has a « Condiments » leaf right
--   beside « Huiles » — so they are categories mis-encoded as characteristic
--   values. Measured usage across the whole database confirms the judgement:
--   « Huile végétale » 3 rows (1 live), « Sel » 2 rows (0 live), and the other
--   five options 0 rows each. The canonical attribute therefore carries the
--   three oil types and nothing else.
--
-- WHY A DEDICATED TEMPLATE
--   « Type » is NOT appended to BEVERAGE: that template is shared by FIVE leaves
--   — Huiles, Eau, Jus, Sodas, Boissons énergétiques — so appending there would
--   offer bottled water « Huile de palme ». OIL is the same pattern IRON,
--   PRINTER, FRIDGE, WASHER and FAN already use. « Type » is appended LAST
--   because attribute ids are positional, so « Volume » …1010701 and
--   « Date d'expiration » …1010702 keep their ids and the new row takes the
--   free …1010703. Proven across all 383 canonical ids: 1 added, 0 moved.
--
-- WHAT THIS DOES
--   1. Creates the canonical « Type » on the « Huiles » LEAF.
--   2. Repoints pocc99's single live specification onto it — same row id, same
--      value.
--   3. Re-homes the legacy misplaced attribute onto the existing holding
--      category.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   NOTHING IS DELETED. The legacy attribute keeps its id, and ALL FOUR of its
--   historical specifications stay attached to it, byte-for-byte:
--
--     abc28b "Huile végétale"   3f8922 "Huile végétale"
--     6bf301 "Sel"              28e29b "Sel"
--
--   The two « Sel » rows are evidence of the previous catalogue state. They are
--   NOT repointed, rewritten, normalised or reinterpreted as oil data — doing so
--   would invent history. No category is created: « Condiments » already exists
--   and is out of scope here. The 117 + 2 preserved rows are untouched.
--
-- SAFETY — REFUSAL FIRST
--   One atomic DO block, three branches: already applied → NOTICE; exactly the
--   reviewed pre-state → apply; anything else → RAISE EXCEPTION with no write.
--   Every row is addressed by EXACT id AND expected current value, and no
--   statement matches on an attribute NAME — « Type » exists on a dozen leaves.
--
-- EXPECTED EFFECT
--   product_attributes ........... 585 → 586 (one created; nothing deleted)
--   product_specifications ....... 344 → 344 (repoint only)
--   categories / products / brands / brand_categories / orders ... unchanged
--   holding category attributes .. 51 → 52
--   attributes on live intermediate nodes ... 1 → 0
--   taxonomy:diff judgement ...... 1 → 0
--   buyer PDP for pocc99 ......... « Type : Huile végétale » — same label/value
--   seller form for Huiles ....... gains « Type », PRE-FILLED and editable
--   seller form for Eau/Jus/Sodas/Café/Thé/Boissons énergétiques ... UNCHANGED
--
-- ROLLBACK at the bottom. Read its note on the created row before using it.

DO $$
DECLARE
  v_spec      CONSTANT uuid := '5bf39dfd-925b-461e-8a4c-07028a2a183d';
  v_product   CONSTANT uuid := '6194eaf7-30fe-469a-8604-36d38a490e73'; -- pocc99
  v_old_attr  CONSTANT uuid := '14000000-0000-0000-0000-000000010202'; -- legacy « Type »
  v_new_attr  CONSTANT uuid := '14000000-0000-0000-0000-000001010703'; -- canonical « Type »
  v_old_home  CONSTANT uuid := '13000000-0000-0000-0000-000000000102'; -- Supermarché > Boissons
  v_leaf      CONSTANT uuid := '16000000-0000-0000-0000-000000010107'; -- Huiles
  v_holding   CONSTANT uuid := '13000000-0000-0000-0000-000000000999';
  v_value     CONSTANT text  := 'Huile végétale';
  v_options   CONSTANT jsonb := '["Huile végétale","Huile d''olive","Huile de palme"]'::jsonb;
  -- Beverage leaves that share the BEVERAGE template and must NEVER gain « Type ».
  v_beverages CONSTANT uuid[] := ARRAY[
    '16000000-0000-0000-0000-000000010201'::uuid, -- Eau
    '16000000-0000-0000-0000-000000010202'::uuid, -- Jus
    '16000000-0000-0000-0000-000000010203'::uuid, -- Sodas
    '16000000-0000-0000-0000-000000010204'::uuid, -- Café
    '16000000-0000-0000-0000-000000010205'::uuid, -- Thé
    '16000000-0000-0000-0000-000000010206'::uuid  -- Boissons énergétiques
  ];

  v_points_old int;
  v_points_new int;
  v_live_refs  int;
  v_hist_refs  int;
  v_hist_sel   int;
  v_collision  int;
  v_attr_home  uuid;
  v_leaf_ok    int;
  v_existing   jsonb;
  v_bev_before int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "products" WHERE "id" = v_product AND "deletedAt" IS NULL AND "status" = 'ACTIVE' AND "categoryId" = v_leaf) THEN
    RAISE EXCEPTION 'P3-4d REFUSED: product % (pocc99) is missing, deleted, not ACTIVE, or no longer on the « Huiles » leaf.', v_product;
  END IF;

  -- Destination must exist, be active, and still be a LEAF.
  SELECT count(*) INTO v_leaf_ok FROM "categories" c
   WHERE c."id" = v_leaf AND c."deletedAt" IS NULL AND c."isActive"
     AND NOT EXISTS (SELECT 1 FROM "categories" k WHERE k."parentCategoryId" = c."id" AND k."deletedAt" IS NULL);
  IF v_leaf_ok <> 1 THEN
    RAISE EXCEPTION 'P3-4d REFUSED: « Huiles » % is missing, inactive, deleted or no longer a leaf.', v_leaf;
  END IF;

  -- If the canonical row already exists it must be OURS, on the right leaf,
  -- with the exact approved options — never silently adopted.
  SELECT "options" INTO v_existing FROM "product_attributes" WHERE "id" = v_new_attr;
  IF v_existing IS NOT NULL THEN
    IF (SELECT count(*) FROM "product_attributes"
         WHERE "id" = v_new_attr AND "categoryId" = v_leaf AND "name" = 'Type' AND "options" = v_options) <> 1 THEN
      RAISE EXCEPTION 'P3-4d REFUSED: % already exists in an incompatible form (wrong owner, name or options).', v_new_attr;
    END IF;
  END IF;

  -- Snapshot the beverage leaves so the post-condition can prove no leakage.
  SELECT count(*) INTO v_bev_before FROM "product_attributes" WHERE "categoryId" = ANY(v_beverages);

  SELECT count(*) INTO v_points_old FROM "product_specifications"
   WHERE "id" = v_spec AND "productId" = v_product AND "attributeId" = v_old_attr AND "value" = v_value;
  SELECT count(*) INTO v_points_new FROM "product_specifications"
   WHERE "id" = v_spec AND "productId" = v_product AND "attributeId" = v_new_attr AND "value" = v_value;
  SELECT "categoryId" INTO v_attr_home FROM "product_attributes" WHERE "id" = v_old_attr;

  -- ── branch 1: already applied ────────────────────────────────────────────
  IF v_points_new = 1 AND v_attr_home = v_holding THEN
    RAISE NOTICE 'P3-4d already applied — specification % already points at the canonical « Type » and the legacy attribute is already retired. Nothing to do.', v_spec;
    RETURN;
  END IF;

  -- ── branch 3: anything other than the reviewed pre-state ─────────────────
  IF v_points_old <> 1 THEN
    RAISE EXCEPTION 'P3-4d REFUSED: specification % is not in the reviewed state (expected productId=%, attributeId=%, value="%"). Production has drifted; re-audit before applying.',
      v_spec, v_product, v_old_attr, v_value;
  END IF;
  IF v_attr_home <> v_old_home THEN
    RAISE EXCEPTION 'P3-4d REFUSED: legacy attribute % is on category % but the reviewed state expects %. Production has drifted; re-audit before applying.',
      v_old_attr, v_attr_home, v_old_home;
  END IF;

  -- Exactly one live reference and exactly four historical ones, two of them
  -- « Sel ». Any other shape means the catalogue moved under us.
  SELECT count(*) INTO v_live_refs FROM "product_specifications" s
    JOIN "products" pr ON pr."id" = s."productId"
   WHERE s."attributeId" = v_old_attr AND pr."deletedAt" IS NULL;
  IF v_live_refs <> 1 THEN
    RAISE EXCEPTION 'P3-4d REFUSED: expected exactly 1 live specification on the legacy attribute, found %.', v_live_refs;
  END IF;
  SELECT count(*) INTO v_hist_refs FROM "product_specifications" s
    JOIN "products" pr ON pr."id" = s."productId"
   WHERE s."attributeId" = v_old_attr AND pr."deletedAt" IS NOT NULL;
  IF v_hist_refs <> 4 THEN
    RAISE EXCEPTION 'P3-4d REFUSED: expected exactly 4 historical specifications on the legacy attribute, found %.', v_hist_refs;
  END IF;
  SELECT count(*) INTO v_hist_sel FROM "product_specifications" s
    JOIN "products" pr ON pr."id" = s."productId"
   WHERE s."attributeId" = v_old_attr AND pr."deletedAt" IS NOT NULL AND s."value" = 'Sel';
  IF v_hist_sel <> 2 THEN
    RAISE EXCEPTION 'P3-4d REFUSED: expected exactly 2 historical « Sel » specifications, found %. These must stay on the legacy attribute.', v_hist_sel;
  END IF;

  SELECT count(*) INTO v_collision FROM "product_specifications"
   WHERE "productId" = v_product AND "attributeId" = v_new_attr;
  IF v_collision <> 0 THEN
    RAISE EXCEPTION 'P3-4d REFUSED: product % already holds a canonical « Type » specification. Repointing would violate the (productId, attributeId) unique constraint and could lose a seller value.', v_product;
  END IF;

  -- ── branch 2: apply ──────────────────────────────────────────────────────
  INSERT INTO "product_attributes" ("id", "categoryId", "name", "type", "options", "isRequired", "sortOrder", "createdAt", "updatedAt")
  VALUES (v_new_attr, v_leaf, 'Type', 'SELECT', v_options, FALSE, 3, NOW(), NOW())
  ON CONFLICT ("id") DO NOTHING;

  UPDATE "product_specifications"
     SET "attributeId" = v_new_attr, "updatedAt" = NOW()
   WHERE "id" = v_spec AND "productId" = v_product AND "attributeId" = v_old_attr AND "value" = v_value;

  UPDATE "product_attributes"
     SET "categoryId" = v_holding, "updatedAt" = NOW()
   WHERE "id" = v_old_attr AND "categoryId" = v_old_home;

  -- ── post-conditions ──────────────────────────────────────────────────────
  IF (SELECT count(*) FROM "product_attributes"
       WHERE "id" = v_new_attr AND "categoryId" = v_leaf AND "name" = 'Type' AND "options" = v_options) <> 1 THEN
    RAISE EXCEPTION 'P3-4d ABORTED: the canonical « Type » is not on the « Huiles » leaf with the three approved options.';
  END IF;
  IF (SELECT count(*) FROM "product_attributes" WHERE "categoryId" = v_leaf AND "name" = 'Type') <> 1 THEN
    RAISE EXCEPTION 'P3-4d ABORTED: « Huiles » carries more than one « Type ».';
  END IF;
  IF (SELECT count(*) FROM "product_specifications"
       WHERE "id" = v_spec AND "attributeId" = v_new_attr AND "value" = v_value) <> 1 THEN
    RAISE EXCEPTION 'P3-4d ABORTED: the repointed specification is not in the expected end state.';
  END IF;
  IF (SELECT count(*) FROM "product_specifications" WHERE "productId" = v_product AND "attributeId" = v_new_attr) <> 1 THEN
    RAISE EXCEPTION 'P3-4d ABORTED: product % would hold more than one canonical « Type » specification.', v_product;
  END IF;
  IF (SELECT "categoryId" FROM "product_attributes" WHERE "id" = v_old_attr) <> v_holding THEN
    RAISE EXCEPTION 'P3-4d ABORTED: the legacy « Type » was not retired onto the holding category.';
  END IF;
  IF (SELECT count(*) FROM "product_specifications" s JOIN "products" pr ON pr."id" = s."productId"
       WHERE s."attributeId" = v_old_attr AND pr."deletedAt" IS NULL) <> 0 THEN
    RAISE EXCEPTION 'P3-4d ABORTED: the legacy attribute still has live specifications.';
  END IF;
  IF (SELECT count(*) FROM "product_specifications" WHERE "attributeId" = v_old_attr) <> 4 THEN
    RAISE EXCEPTION 'P3-4d ABORTED: the four historical specifications of the legacy attribute are no longer intact.';
  END IF;
  IF (SELECT count(*) FROM "product_specifications" WHERE "attributeId" = v_old_attr AND "value" = 'Sel') <> 2 THEN
    RAISE EXCEPTION 'P3-4d ABORTED: the two historical « Sel » specifications must remain on the legacy attribute, unchanged.';
  END IF;
  IF (SELECT count(*) FROM "product_attributes" WHERE "categoryId" = ANY(v_beverages)) <> v_bev_before THEN
    RAISE EXCEPTION 'P3-4d ABORTED: a beverage leaf gained or lost a characteristic — the oil « Type » must never reach Eau, Jus, Sodas, Café, Thé or Boissons énergétiques.';
  END IF;
  IF EXISTS (SELECT 1 FROM "product_attributes" WHERE "categoryId" = ANY(v_beverages) AND "name" = 'Type') THEN
    RAISE EXCEPTION 'P3-4d ABORTED: a beverage leaf carries a « Type » characteristic.';
  END IF;

  RAISE NOTICE 'P3-4d applied: canonical « Type » created on « Huiles »; specification % repointed with value "%" preserved; legacy « Type » retired with its 4 historical specifications (including both « Sel ») intact.', v_spec, v_value;
END $$;

-- ── ROLLBACK (manual, not executed) ──────────────────────────────────────────
-- THREE DISTINCT LEVELS — do not confuse them:
--
--   A. DATABASE MIGRATION ROLLBACK (the two UPDATEs below). Restores the
--      specification's owner and the legacy attribute's category. This alone
--      undoes the user-visible effect.
--
--   B. CODE / DECLARATION ROLLBACK (revert the OIL template in
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
--    SET "attributeId" = '14000000-0000-0000-0000-000000010202', "updatedAt" = NOW()
--  WHERE "id" = '5bf39dfd-925b-461e-8a4c-07028a2a183d'
--    AND "attributeId" = '14000000-0000-0000-0000-000001010703';
--
-- UPDATE "product_attributes"
--    SET "categoryId" = '13000000-0000-0000-0000-000000000102', "updatedAt" = NOW()
--  WHERE "id" = '14000000-0000-0000-0000-000000010202'
--    AND "categoryId" = '13000000-0000-0000-0000-000000000999';
--
-- B — only WITH the taxonomy-data.ts revert, and only if unreferenced:
-- DELETE FROM "product_attributes" WHERE "id" = '14000000-0000-0000-0000-000001010703'
--   AND NOT EXISTS (SELECT 1 FROM "product_specifications" WHERE "attributeId" = '14000000-0000-0000-0000-000001010703');
