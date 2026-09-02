-- Remediate two legacy products sitting on INTERMEDIATE categories
--
-- NOT auto-applied. Mutates product data, so it ships via the "Apply prod
-- migration" workflow (Actions → Run workflow → paste this filename).
-- Deliberately absent from auto-apply.list.
--
-- SCOPE — exactly two products. rb7t4r (Johnnie Walker) is NOT included: it is
-- blocked pending a business/restricted-product policy decision, because Teka
-- has no restricted-product policy, no age verification and no alcohol leaf.
--
--   h0d799  1a07d699-f9d5-42da-aa23-b999bc84ef37
--           « Mode > Homme » (intermediate)  →  « Mode > Homme > Chemises »
--           + 3 specifications on the Chemises attributes:
--               Taille  = M      14000000-…-000005010201  (SELECT)
--               Couleur = Bleu   14000000-…-000005010202  (TEXT)
--               Matière = Coton  14000000-…-000005010203  (TEXT)
--           Its 3 ORIGINAL specifications, which hang off
--           « Électroménager > Cuisine » attributes, are PRESERVED untouched.
--
--   vnkqce  dd4fa8c5-a41f-4a2f-a00b-07f9acb2eff0
--           « Supermarché > Entretien Maison » → « … > Lessive »
--           NO specification is transferred: the target leaf has only Volume
--           and Date d'expiration, so the legacy « Type = Savon de lessive »
--           has no equivalent. That row is PRESERVED untouched; inventing a
--           mapping was explicitly rejected.
--           (Noted for later: Lessive exposes Volume, but this product is sold
--           by weight (1,5 kg). A Poids attribute is a possible future
--           taxonomy improvement — deliberately NOT changed here.)
--
-- SAFETY — the migration validates its own assumptions rather than relying on
-- a human running a SELECT first. Every precondition below RAISES and rolls the
-- whole transaction back; neither product is ever partially remediated.
--   * product row exists
--   * its current category is the expected intermediate one (or already the
--     target, in which case that product is skipped — see IDEMPOTENCY)
--   * the target leaf exists, is NOT soft-deleted, and is a real leaf
--   * for h0d799: the 3 target attributes exist AND belong to Chemises
--   * for h0d799: 'M' is a valid option of the target Taille SELECT
--   * POST-condition: after the inserts, all 3 target specs exist with the
--     expected values, else RAISE
--   * for vnkqce: no specification mapping is attempted at all, and its legacy
--     row must still be present afterwards, else RAISE
--
-- IDEMPOTENCY — a second run is a safe no-op. Each product is skipped when it
-- already sits on its target category; the spec inserts are ON CONFLICT DO
-- NOTHING; and only rows ACTUALLY inserted are journalled.
--
-- ROLLBACK — provenance-based, so it can never delete a specification that
-- legitimately pre-existed. Every row this migration actually creates is
-- recorded in product_remediation_20260903 (ON CONFLICT DO NOTHING means a
-- pre-existing spec is never journalled, and therefore never deleted):
--
--   BEGIN;
--   -- 1. restore both categories from the journal
--   UPDATE products p SET "categoryId" = j."previousCategoryId", "updatedAt" = now()
--     FROM product_remediation_20260903 j
--    WHERE j."productId" = p.id AND j.action = 'category_repointed'
--      AND p."categoryId" = j."newCategoryId";
--   -- 2. delete ONLY the specification rows this migration created
--   DELETE FROM product_specifications s
--    USING product_remediation_20260903 j
--    WHERE j.action = 'spec_inserted'
--      AND s."productId" = j."productId" AND s."attributeId" = j."attributeId";
--   -- 3. the original legacy specifications are never touched by any step.
--   COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS product_remediation_20260903 (
  id                   bigserial   PRIMARY KEY,
  "productId"          uuid        NOT NULL,
  action               text        NOT NULL,
  "attributeId"        uuid,
  "previousCategoryId" uuid,
  "newCategoryId"      uuid,
  "appliedAt"          timestamptz NOT NULL DEFAULT now()
);

-- ── h0d799 ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_product  uuid := '1a07d699-f9d5-42da-aa23-b999bc84ef37';
  v_old      uuid := '13000000-0000-0000-0000-000000000501';
  v_target   uuid := '16000000-0000-0000-0000-000000050102';
  a_taille   uuid := '14000000-0000-0000-0000-000005010201';
  a_couleur  uuid := '14000000-0000-0000-0000-000005010202';
  a_matiere  uuid := '14000000-0000-0000-0000-000005010203';
  v_current  uuid;
  v_n        int;
BEGIN
  SELECT "categoryId" INTO v_current FROM products WHERE id = v_product;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'h0d799: product % not found', v_product;
  END IF;

  IF v_current = v_target THEN
    RAISE NOTICE 'h0d799: already on Chemises — skipping (idempotent re-run)';
  ELSE
    IF v_current <> v_old THEN
      RAISE EXCEPTION 'h0d799: expected category % or %, found %', v_old, v_target, v_current;
    END IF;

    -- target leaf must exist, be live, and actually be a leaf
    PERFORM 1 FROM categories WHERE id = v_target AND "deletedAt" IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'h0d799: target category % missing or soft-deleted', v_target;
    END IF;
    SELECT COUNT(*) INTO v_n FROM categories
     WHERE "parentCategoryId" = v_target AND "deletedAt" IS NULL;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'h0d799: target % is not a leaf (% live children)', v_target, v_n;
    END IF;

    -- the 3 target attributes must exist AND belong to the target leaf
    SELECT COUNT(*) INTO v_n FROM product_attributes
     WHERE id IN (a_taille, a_couleur, a_matiere) AND "categoryId" = v_target;
    IF v_n <> 3 THEN
      RAISE EXCEPTION 'h0d799: expected 3 target attributes on %, found %', v_target, v_n;
    END IF;

    -- 'M' must be a valid option of the target Taille SELECT
    PERFORM 1 FROM product_attributes
      WHERE id = a_taille AND type = 'SELECT' AND options ? 'M';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'h0d799: "M" is not a valid option of the target Taille attribute';
    END IF;

    -- create the correct leaf specs FIRST, journalling only real inserts
    WITH ins AS (
      INSERT INTO product_specifications (id, "productId", "attributeId", value, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), v_product, a_taille,  'M',     now(), now()),
             (gen_random_uuid(), v_product, a_couleur, 'Bleu',  now(), now()),
             (gen_random_uuid(), v_product, a_matiere, 'Coton', now(), now())
      ON CONFLICT ("productId", "attributeId") DO NOTHING
      RETURNING "productId", "attributeId"
    )
    INSERT INTO product_remediation_20260903 ("productId", action, "attributeId")
    SELECT "productId", 'spec_inserted', "attributeId" FROM ins;

    -- POST-CONDITION: all three must now exist with the expected values
    SELECT COUNT(*) INTO v_n FROM product_specifications
     WHERE "productId" = v_product
       AND (("attributeId" = a_taille  AND value = 'M')
         OR ("attributeId" = a_couleur AND value = 'Bleu')
         OR ("attributeId" = a_matiere AND value = 'Coton'));
    IF v_n <> 3 THEN
      RAISE EXCEPTION 'h0d799: expected 3 target specifications after insert, found %', v_n;
    END IF;

    -- only now re-point the category
    INSERT INTO product_remediation_20260903 ("productId", action, "previousCategoryId", "newCategoryId")
    VALUES (v_product, 'category_repointed', v_current, v_target);
    UPDATE products SET "categoryId" = v_target, "updatedAt" = now()
     WHERE id = v_product AND "categoryId" = v_old;

    RAISE NOTICE 'h0d799: remediated → Chemises (3 specs created, legacy specs preserved)';
  END IF;
END $$;

-- ── vnkqce ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_product uuid := 'dd4fa8c5-a41f-4a2f-a00b-07f9acb2eff0';
  v_old     uuid := '13000000-0000-0000-0000-000000000104';
  v_target  uuid := '16000000-0000-0000-0000-000000010401';
  v_current uuid;
  v_before  int;
  v_after   int;
  v_n       int;
BEGIN
  SELECT "categoryId" INTO v_current FROM products WHERE id = v_product;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vnkqce: product % not found', v_product;
  END IF;

  IF v_current = v_target THEN
    RAISE NOTICE 'vnkqce: already on Lessive — skipping (idempotent re-run)';
  ELSE
    IF v_current <> v_old THEN
      RAISE EXCEPTION 'vnkqce: expected category % or %, found %', v_old, v_target, v_current;
    END IF;

    PERFORM 1 FROM categories WHERE id = v_target AND "deletedAt" IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'vnkqce: target category % missing or soft-deleted', v_target;
    END IF;
    SELECT COUNT(*) INTO v_n FROM categories
     WHERE "parentCategoryId" = v_target AND "deletedAt" IS NULL;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'vnkqce: target % is not a leaf (% live children)', v_target, v_n;
    END IF;

    SELECT COUNT(*) INTO v_before FROM product_specifications WHERE "productId" = v_product;

    -- NO specification is inserted, mapped or removed for this product. The
    -- target leaf has no Type attribute, so the legacy value has no equivalent.
    INSERT INTO product_remediation_20260903 ("productId", action, "previousCategoryId", "newCategoryId")
    VALUES (v_product, 'category_repointed', v_current, v_target);
    UPDATE products SET "categoryId" = v_target, "updatedAt" = now()
     WHERE id = v_product AND "categoryId" = v_old;

    -- POST-CONDITION: the legacy specifications must be exactly as before
    SELECT COUNT(*) INTO v_after FROM product_specifications WHERE "productId" = v_product;
    IF v_after <> v_before THEN
      RAISE EXCEPTION 'vnkqce: specification count changed (% → %); it must be preserved', v_before, v_after;
    END IF;

    RAISE NOTICE 'vnkqce: remediated → Lessive (% legacy specs preserved, none transferred)', v_after;
  END IF;
END $$;

COMMIT;
