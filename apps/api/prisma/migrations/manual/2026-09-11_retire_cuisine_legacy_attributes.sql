-- P3-4b — retire the three legacy « Cuisine » characteristics (2026-09-11).
-- Initiative: docs/pre-scale-readiness.md — P3-4b.
--
-- WHY
--   « Taille », « Couleur » and « Matière » sit on the LIVE INTERMEDIATE node
--   « Électroménager > Cuisine ». They are clothing characteristics: the
--   2026-06-24 refactor reused subcategory id …0401 — previously a Mode
--   subcategory — for « Cuisine », and the attributes stayed behind. Their
--   option lists say so plainly (XS…XXXL; Coton, Polyester, Lin, Jean, Cuir,
--   Laine, Wax).
--
--   They are invisible today, because `getCategoryAttributes` returns [] for any
--   node with a live child and « Cuisine » has five. But they are the same
--   latent breakage P2 PR B retired 46 of: the moment that node loses its
--   children it becomes a product type and starts offering « Taille : XS » to
--   someone listing a microwave.
--
--   P3-2 removed the last live references (the three duplicate shirt rows), so
--   a read-only production check on 2026-09-11 confirms ZERO live-product
--   references remain:
--
--     « Taille »  4 specifications — ALL on SOFT-DELETED products
--     « Couleur » 0 specifications
--     « Matière » 4 specifications — ALL on SOFT-DELETED products
--
--   That is exactly the condition PR B required, so they now qualify for the
--   same treatment.
--
-- WHAT THIS DOES
--   Moves the three attribute ROWS onto the existing retired holding category
--   `13000000-…-000000000999` (« Caractéristiques héritées (pré-2026-06-24) »),
--   which PR B created and which already holds 47 rows.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   NOTHING IS DELETED. Each attribute keeps its id, so its historical
--   specifications keep a valid foreign key and a soft-deleted product still
--   resolves the characteristic it was listed with. No specification is
--   created, altered or removed — not one `product_specifications` row is
--   written. No replacement characteristic is created. No product, category,
--   brand, order or unrelated attribute is touched. The 117 + 2 preserved
--   legacy rows are out of scope and untouched.
--
-- SAFETY — REFUSAL FIRST
--   One atomic DO block, three branches:
--     • already applied                  → NOTICE, no write (idempotent re-run)
--     • exactly the reviewed pre-state   → apply
--     • anything else                    → RAISE EXCEPTION, no write
--
--   The hard safety condition is re-checked INSIDE the block immediately before
--   writing: each attribute must have ZERO specifications on a non-deleted
--   product. If a seller has since listed a product against one of these rows,
--   the migration refuses rather than hiding a characteristic someone is using.
--
--   Every row is addressed by its EXACT id AND its expected current categoryId.
--   No statement matches on an attribute NAME — « Taille » and « Matière »
--   already exist several times on the holding category, so a name-based
--   migration would be catastrophic here.
--
-- EXPECTED EFFECT
--   product_attributes ........... unchanged (584) — nothing created or deleted
--   product_specifications ....... unchanged (344) — NOT written at all
--   categories / products / brands / orders / order_items ... unchanged
--   holding category attributes .. 47 → 50
--   attributes on live intermediate nodes ... 5 → 2
--   taxonomy:diff judgement ...... 5 → 2
--   Buyer PDPs ................... unchanged (specifications are not touched)
--   Seller forms ................. unchanged (« Cuisine » served [] before and after)
--
-- ROLLBACK at the bottom restores all three original categoryIds exactly.

DO $$
DECLARE
  v_cuisine  CONSTANT uuid := '13000000-0000-0000-0000-000000000401'; -- Électroménager > Cuisine
  v_holding  CONSTANT uuid := '13000000-0000-0000-0000-000000000999'; -- retired holder
  v_taille   CONSTANT uuid := '14000000-0000-0000-0000-000000040101';
  v_couleur  CONSTANT uuid := '14000000-0000-0000-0000-000000040102';
  v_matiere  CONSTANT uuid := '14000000-0000-0000-0000-000000040103';
  v_ids      CONSTANT uuid[] := ARRAY[v_taille, v_couleur, v_matiere];

  v_on_cuisine  int;
  v_on_holding  int;
  v_live_refs   int;
  v_hist_before int;
  v_moved       int;
BEGIN
  SELECT count(*) INTO v_on_cuisine
    FROM "product_attributes" WHERE "id" = ANY(v_ids) AND "categoryId" = v_cuisine;
  SELECT count(*) INTO v_on_holding
    FROM "product_attributes" WHERE "id" = ANY(v_ids) AND "categoryId" = v_holding;

  -- ── branch 1: already applied ────────────────────────────────────────────
  IF v_on_holding = 3 AND v_on_cuisine = 0 THEN
    RAISE NOTICE 'P3-4b already applied — the three legacy « Cuisine » characteristics are already on the holding category. Nothing to do.';
    RETURN;
  END IF;

  -- ── branch 3: anything other than the reviewed pre-state ─────────────────
  IF v_on_cuisine <> 3 THEN
    RAISE EXCEPTION 'P3-4b REFUSED: expected all three legacy characteristics on « Cuisine » (%), found %. Production has drifted; re-audit before applying.',
      v_cuisine, v_on_cuisine;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "categories" WHERE "id" = v_holding) THEN
    RAISE EXCEPTION 'P3-4b REFUSED: the holding category % does not exist. It is created by the P2 PR B migration, which must be applied first.', v_holding;
  END IF;

  -- THE hard safety condition. A characteristic a live product still uses must
  -- never be hidden: retiring it would strand a value its seller can see.
  SELECT count(*) INTO v_live_refs
    FROM "product_specifications" s
    JOIN "products" pr ON pr."id" = s."productId"
   WHERE s."attributeId" = ANY(v_ids) AND pr."deletedAt" IS NULL;
  IF v_live_refs <> 0 THEN
    RAISE EXCEPTION 'P3-4b REFUSED: % specification(s) on LIVE products still reference these characteristics. Retiring them would strand seller data. Resolve those products first.', v_live_refs;
  END IF;

  SELECT count(*) INTO v_hist_before
    FROM "product_specifications" WHERE "attributeId" = ANY(v_ids);

  -- ── branch 2: apply ──────────────────────────────────────────────────────
  -- Keyed on the exact id AND the expected current owner, so a row already
  -- moved, re-pointed or deleted since the audit does not match and nothing
  -- happens. Never keyed on the NAME: « Taille » and « Matière » already exist
  -- on the holding category and a name match would hit the wrong rows.
  UPDATE "product_attributes"
     SET "categoryId" = v_holding, "updatedAt" = NOW()
   WHERE "id" = ANY(v_ids) AND "categoryId" = v_cuisine;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- ── post-conditions: abort the whole block if the end state is not exact ─
  IF v_moved <> 3 THEN
    RAISE EXCEPTION 'P3-4b ABORTED: expected to move exactly 3 characteristics, moved %.', v_moved;
  END IF;
  IF (SELECT count(*) FROM "product_attributes" WHERE "id" = ANY(v_ids) AND "categoryId" = v_holding) <> 3 THEN
    RAISE EXCEPTION 'P3-4b ABORTED: the three characteristics are not all on the holding category.';
  END IF;
  IF (SELECT count(*) FROM "product_attributes" WHERE "categoryId" = v_cuisine) <> 0 THEN
    RAISE EXCEPTION 'P3-4b ABORTED: « Cuisine » still carries characteristics.';
  END IF;
  IF (SELECT count(*) FROM "product_specifications" WHERE "attributeId" = ANY(v_ids)) <> v_hist_before THEN
    RAISE EXCEPTION 'P3-4b ABORTED: the historical specifications of these characteristics changed (% before).', v_hist_before;
  END IF;

  RAISE NOTICE 'P3-4b applied: 3 legacy « Cuisine » characteristics retired onto the holding category; % historical specification(s) untouched.', v_hist_before;
END $$;

-- ── ROLLBACK (manual, not executed) ──────────────────────────────────────────
-- Restores all three original owners exactly. Nothing was deleted, so this is a
-- complete undo.
--
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000401', "updatedAt" = NOW()
--  WHERE "id" = '14000000-0000-0000-0000-000000040101' AND "categoryId" = '13000000-0000-0000-0000-000000000999';  -- « Taille »
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000401', "updatedAt" = NOW()
--  WHERE "id" = '14000000-0000-0000-0000-000000040102' AND "categoryId" = '13000000-0000-0000-0000-000000000999';  -- « Couleur »
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000401', "updatedAt" = NOW()
--  WHERE "id" = '14000000-0000-0000-0000-000000040103' AND "categoryId" = '13000000-0000-0000-0000-000000000999';  -- « Matière »
