-- Retire the legacy characteristics stranded on live intermediate categories
-- (2026-09-11). Initiative: docs/pre-scale-readiness.md — P2 PR B.
--
-- WHY
--   The 2026-06-24 refactor reused every `13000000-` subcategory id with a new
--   meaning while the previous attributes stayed attached. A read-only audit
--   found 52 such attributes across 25 live intermediate categories —
--   « Type de peau » on Mode > Homme, « Pointure » on Électroménager >
--   Climatisation, « Marque véhicule » on Linge de Maison, « Nombre de feux »
--   on Électronique > Informatique.
--
--   They are invisible today (`getCategoryAttributes` returns [] for any node
--   with a live child) but they are latent breakage: the moment one of those
--   nodes loses its children it becomes a leaf and starts serving nonsense to
--   sellers.
--
-- WHAT THIS DOES — and what it deliberately does NOT
--   46 of the 52 have ZERO dependency on any ACTIVE or ARCHIVED product; their
--   only references are 172 specifications on SOFT-DELETED products. Those 46
--   are moved onto a single retired holding category.
--
--   The remaining 6 have live ACTIVE-product dependencies and are NOT touched
--   here — they are P3 taxonomy-gap decisions (a value with no canonical home
--   cannot be rehomed by a data migration).
--
-- WHY A HOLDING CATEGORY RATHER THAN A FLAG
--   `product_attributes` has no `isActive` and no `deletedAt` — it is one of the
--   few models outside the repo's 22-model soft-delete convention. Adding a
--   column would mean a schema change plus filters in three runtime services
--   and a change to the admin category editor, which is far more than this
--   cleanup warrants. Re-parenting onto an inactive, soft-deleted holder makes
--   the rows unreachable with a data-only change, needs no runtime code, and is
--   reversible row by row.
--
--   It is also more truthful: these attributes never belonged to the category
--   they currently sit on — that mislabelling IS the defect. Naming the holder
--   « Caractéristiques héritées » states plainly what they are.
--
-- SAFETY
--   Nothing is deleted. Every attribute keeps its id, so all 172 historical
--   specifications keep a valid foreign key and a soft-deleted product still
--   resolves the characteristic it was listed with. No product, order,
--   order_item, brand or specification row is touched; no live category is
--   modified.
--
--   Each UPDATE is keyed on the exact attribute id AND its current categoryId,
--   so a row already moved, re-pointed, or deleted since the audit does not
--   match and nothing happens — idempotent, and under-applying rather than
--   mutating the wrong row if production has drifted.
--
-- EXPECTED EFFECT
--   attributes on live intermediate categories: 52 → 6 (the P3 set)
--   product_attributes total ................. unchanged (nothing deleted)
--   categories ............................... +1 (inactive, soft-deleted)
--   product_specifications ................... unchanged
--   products / orders / order_items / brands . unchanged
--
-- ROLLBACK at the bottom restores every row's original categoryId exactly.

-- ── 1. the retired holding category ─────────────────────────────────────
INSERT INTO "categories" ("id", "slug", "name", "parentCategoryId", "sortOrder", "isActive", "deletedAt", "createdAt", "updatedAt")
VALUES ('13000000-0000-0000-0000-000000000999', NULL, 'Caractéristiques héritées (pré-2026-06-24)', NULL, 999, FALSE, NOW(), NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- ── 2. move the 46 latent legacy characteristics onto it ────────────────
-- « Poids » from Supermarché > Alimentation  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000010101'
   AND "categoryId" = '13000000-0000-0000-0000-000000000101';
-- « Type » from Supermarché > Alimentation  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000010102'
   AND "categoryId" = '13000000-0000-0000-0000-000000000101';
-- « Volume » from Supermarché > Boissons  (2 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000010201'
   AND "categoryId" = '13000000-0000-0000-0000-000000000102';
-- « Type » from Supermarché > Lait & Produits Laitiers  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000010601'
   AND "categoryId" = '13000000-0000-0000-0000-000000000106';
-- « Volume » from Supermarché > Lait & Produits Laitiers  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000010602'
   AND "categoryId" = '13000000-0000-0000-0000-000000000106';
-- « Type » from Supermarché > Boissons Alcoolisées  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000010701'
   AND "categoryId" = '13000000-0000-0000-0000-000000000107';
-- « RAM » from Téléphones & Accessoires > Smartphones  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000020103'
   AND "categoryId" = '13000000-0000-0000-0000-000000000201';
-- « État » from Téléphones & Accessoires > Smartphones  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000020105'
   AND "categoryId" = '13000000-0000-0000-0000-000000000201';
-- « Taille écran » from Téléphones & Accessoires > Smartphones  (2 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000020107'
   AND "categoryId" = '13000000-0000-0000-0000-000000000201';
-- « Mémoire interne » from Téléphones & Accessoires > Tablettes  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000020301'
   AND "categoryId" = '13000000-0000-0000-0000-000000000203';
-- « Taille écran » from Téléphones & Accessoires > Tablettes  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000020302'
   AND "categoryId" = '13000000-0000-0000-0000-000000000203';
-- « Type de connecteur » from Téléphones & Accessoires > Accessoires  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000020401'
   AND "categoryId" = '13000000-0000-0000-0000-000000000204';
-- « Puissance » from Téléphones & Accessoires > Accessoires  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000020402'
   AND "categoryId" = '13000000-0000-0000-0000-000000000204';
-- « Charge rapide » from Téléphones & Accessoires > Accessoires  (2 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000020403'
   AND "categoryId" = '13000000-0000-0000-0000-000000000204';
-- « Type » from Téléphones & Accessoires > Objets Connectés  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000020501'
   AND "categoryId" = '13000000-0000-0000-0000-000000000205';
-- « Sans fil » from Téléphones & Accessoires > Objets Connectés  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000020502'
   AND "categoryId" = '13000000-0000-0000-0000-000000000205';
-- « Type » from Électronique > TV & Audio  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000030101'
   AND "categoryId" = '13000000-0000-0000-0000-000000000301';
-- « Capacité » from Électronique > TV & Audio  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000030102'
   AND "categoryId" = '13000000-0000-0000-0000-000000000301';
-- « Nombre de feux » from Électronique > Informatique  (0 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000030202'
   AND "categoryId" = '13000000-0000-0000-0000-000000000302';
-- « Type » from Électronique > Caméras  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000030401'
   AND "categoryId" = '13000000-0000-0000-0000-000000000304';
-- « Capacité » from Électronique > Caméras  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000030402'
   AND "categoryId" = '13000000-0000-0000-0000-000000000304';
-- « Taille » from Électroménager > Réfrigération  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000040201'
   AND "categoryId" = '13000000-0000-0000-0000-000000000402';
-- « Matière » from Électroménager > Réfrigération  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000040203'
   AND "categoryId" = '13000000-0000-0000-0000-000000000402';
-- « Pointure » from Électroménager > Climatisation  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000040401'
   AND "categoryId" = '13000000-0000-0000-0000-000000000404';
-- « Matière » from Électroménager > Climatisation  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000040403'
   AND "categoryId" = '13000000-0000-0000-0000-000000000404';
-- « Pointure » from Électroménager > Entretien Maison  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000040501'
   AND "categoryId" = '13000000-0000-0000-0000-000000000405';
-- « Matière » from Électroménager > Entretien Maison  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000040503'
   AND "categoryId" = '13000000-0000-0000-0000-000000000405';
-- « Type » from Mode > Homme  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000050101'
   AND "categoryId" = '13000000-0000-0000-0000-000000000501';
-- « Type de peau » from Mode > Homme  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000050102'
   AND "categoryId" = '13000000-0000-0000-0000-000000000501';
-- « Type » from Mode > Enfants  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000050301'
   AND "categoryId" = '13000000-0000-0000-0000-000000000503';
-- « Type de cheveux » from Mode > Enfants  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000050302'
   AND "categoryId" = '13000000-0000-0000-0000-000000000503';
-- « Type » from Mode > Chaussures  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000050401'
   AND "categoryId" = '13000000-0000-0000-0000-000000000504';
-- « Longueur » from Mode > Chaussures  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000050402'
   AND "categoryId" = '13000000-0000-0000-0000-000000000504';
-- « Type de cheveux » from Mode > Chaussures  (2 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000050403'
   AND "categoryId" = '13000000-0000-0000-0000-000000000504';
-- « Type » from Mode > Accessoires  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000050501'
   AND "categoryId" = '13000000-0000-0000-0000-000000000505';
-- « Type » from Beauté & Santé > Beauté  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000060101'
   AND "categoryId" = '13000000-0000-0000-0000-000000000601';
-- « Conditionnement » from Beauté & Santé > Beauté  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000060102'
   AND "categoryId" = '13000000-0000-0000-0000-000000000601';
-- « Type » from Maison & Cuisine > Cuisine & Vaisselle  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000070101'
   AND "categoryId" = '13000000-0000-0000-0000-000000000701';
-- « Capacité » from Maison & Cuisine > Cuisine & Vaisselle  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000070102'
   AND "categoryId" = '13000000-0000-0000-0000-000000000701';
-- « Type » from Maison & Cuisine > Mobilier & Rangement  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000070201'
   AND "categoryId" = '13000000-0000-0000-0000-000000000702';
-- « Dimension » from Maison & Cuisine > Mobilier & Rangement  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000070202'
   AND "categoryId" = '13000000-0000-0000-0000-000000000702';
-- « Type » from Maison & Cuisine > Décoration & Éclairage  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000070301'
   AND "categoryId" = '13000000-0000-0000-0000-000000000703';
-- « Viscosité » from Maison & Cuisine > Décoration & Éclairage  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000070302'
   AND "categoryId" = '13000000-0000-0000-0000-000000000703';
-- « Volume » from Maison & Cuisine > Décoration & Éclairage  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000070303'
   AND "categoryId" = '13000000-0000-0000-0000-000000000703';
-- « Type de pièce » from Maison & Cuisine > Linge de Maison  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000070401'
   AND "categoryId" = '13000000-0000-0000-0000-000000000704';
-- « Marque véhicule » from Maison & Cuisine > Linge de Maison  (4 historical spec(s))
UPDATE "product_attributes"
   SET "categoryId" = '13000000-0000-0000-0000-000000000999', "updatedAt" = NOW()
 WHERE "id" = '14000000-0000-0000-0000-000000070402'
   AND "categoryId" = '13000000-0000-0000-0000-000000000704';
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (run by hand only; not part of any automatic path)
--
-- -- 1. restore each characteristic to its original category
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000101' WHERE "id" = '14000000-0000-0000-0000-000000010101';  -- « Poids » → Supermarché > Alimentation
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000101' WHERE "id" = '14000000-0000-0000-0000-000000010102';  -- « Type » → Supermarché > Alimentation
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000102' WHERE "id" = '14000000-0000-0000-0000-000000010201';  -- « Volume » → Supermarché > Boissons
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000106' WHERE "id" = '14000000-0000-0000-0000-000000010601';  -- « Type » → Supermarché > Lait & Produits Laitiers
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000106' WHERE "id" = '14000000-0000-0000-0000-000000010602';  -- « Volume » → Supermarché > Lait & Produits Laitiers
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000107' WHERE "id" = '14000000-0000-0000-0000-000000010701';  -- « Type » → Supermarché > Boissons Alcoolisées
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000201' WHERE "id" = '14000000-0000-0000-0000-000000020103';  -- « RAM » → Téléphones & Accessoires > Smartphones
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000201' WHERE "id" = '14000000-0000-0000-0000-000000020105';  -- « État » → Téléphones & Accessoires > Smartphones
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000201' WHERE "id" = '14000000-0000-0000-0000-000000020107';  -- « Taille écran » → Téléphones & Accessoires > Smartphones
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000203' WHERE "id" = '14000000-0000-0000-0000-000000020301';  -- « Mémoire interne » → Téléphones & Accessoires > Tablettes
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000203' WHERE "id" = '14000000-0000-0000-0000-000000020302';  -- « Taille écran » → Téléphones & Accessoires > Tablettes
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000204' WHERE "id" = '14000000-0000-0000-0000-000000020401';  -- « Type de connecteur » → Téléphones & Accessoires > Accessoires
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000204' WHERE "id" = '14000000-0000-0000-0000-000000020402';  -- « Puissance » → Téléphones & Accessoires > Accessoires
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000204' WHERE "id" = '14000000-0000-0000-0000-000000020403';  -- « Charge rapide » → Téléphones & Accessoires > Accessoires
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000205' WHERE "id" = '14000000-0000-0000-0000-000000020501';  -- « Type » → Téléphones & Accessoires > Objets Connectés
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000205' WHERE "id" = '14000000-0000-0000-0000-000000020502';  -- « Sans fil » → Téléphones & Accessoires > Objets Connectés
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000301' WHERE "id" = '14000000-0000-0000-0000-000000030101';  -- « Type » → Électronique > TV & Audio
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000301' WHERE "id" = '14000000-0000-0000-0000-000000030102';  -- « Capacité » → Électronique > TV & Audio
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000302' WHERE "id" = '14000000-0000-0000-0000-000000030202';  -- « Nombre de feux » → Électronique > Informatique
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000304' WHERE "id" = '14000000-0000-0000-0000-000000030401';  -- « Type » → Électronique > Caméras
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000304' WHERE "id" = '14000000-0000-0000-0000-000000030402';  -- « Capacité » → Électronique > Caméras
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000402' WHERE "id" = '14000000-0000-0000-0000-000000040201';  -- « Taille » → Électroménager > Réfrigération
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000402' WHERE "id" = '14000000-0000-0000-0000-000000040203';  -- « Matière » → Électroménager > Réfrigération
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000404' WHERE "id" = '14000000-0000-0000-0000-000000040401';  -- « Pointure » → Électroménager > Climatisation
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000404' WHERE "id" = '14000000-0000-0000-0000-000000040403';  -- « Matière » → Électroménager > Climatisation
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000405' WHERE "id" = '14000000-0000-0000-0000-000000040501';  -- « Pointure » → Électroménager > Entretien Maison
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000405' WHERE "id" = '14000000-0000-0000-0000-000000040503';  -- « Matière » → Électroménager > Entretien Maison
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000501' WHERE "id" = '14000000-0000-0000-0000-000000050101';  -- « Type » → Mode > Homme
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000501' WHERE "id" = '14000000-0000-0000-0000-000000050102';  -- « Type de peau » → Mode > Homme
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000503' WHERE "id" = '14000000-0000-0000-0000-000000050301';  -- « Type » → Mode > Enfants
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000503' WHERE "id" = '14000000-0000-0000-0000-000000050302';  -- « Type de cheveux » → Mode > Enfants
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000504' WHERE "id" = '14000000-0000-0000-0000-000000050401';  -- « Type » → Mode > Chaussures
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000504' WHERE "id" = '14000000-0000-0000-0000-000000050402';  -- « Longueur » → Mode > Chaussures
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000504' WHERE "id" = '14000000-0000-0000-0000-000000050403';  -- « Type de cheveux » → Mode > Chaussures
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000505' WHERE "id" = '14000000-0000-0000-0000-000000050501';  -- « Type » → Mode > Accessoires
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000601' WHERE "id" = '14000000-0000-0000-0000-000000060101';  -- « Type » → Beauté & Santé > Beauté
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000601' WHERE "id" = '14000000-0000-0000-0000-000000060102';  -- « Conditionnement » → Beauté & Santé > Beauté
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000701' WHERE "id" = '14000000-0000-0000-0000-000000070101';  -- « Type » → Maison & Cuisine > Cuisine & Vaisselle
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000701' WHERE "id" = '14000000-0000-0000-0000-000000070102';  -- « Capacité » → Maison & Cuisine > Cuisine & Vaisselle
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000702' WHERE "id" = '14000000-0000-0000-0000-000000070201';  -- « Type » → Maison & Cuisine > Mobilier & Rangement
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000702' WHERE "id" = '14000000-0000-0000-0000-000000070202';  -- « Dimension » → Maison & Cuisine > Mobilier & Rangement
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000703' WHERE "id" = '14000000-0000-0000-0000-000000070301';  -- « Type » → Maison & Cuisine > Décoration & Éclairage
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000703' WHERE "id" = '14000000-0000-0000-0000-000000070302';  -- « Viscosité » → Maison & Cuisine > Décoration & Éclairage
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000703' WHERE "id" = '14000000-0000-0000-0000-000000070303';  -- « Volume » → Maison & Cuisine > Décoration & Éclairage
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000704' WHERE "id" = '14000000-0000-0000-0000-000000070401';  -- « Type de pièce » → Maison & Cuisine > Linge de Maison
-- UPDATE "product_attributes" SET "categoryId" = '13000000-0000-0000-0000-000000000704' WHERE "id" = '14000000-0000-0000-0000-000000070402';  -- « Marque véhicule » → Maison & Cuisine > Linge de Maison
--
-- -- 2. remove the holding category (safe only once no attribute points at it)
-- DELETE FROM "categories" WHERE "id" = '13000000-0000-0000-0000-000000000999'
--   AND NOT EXISTS (SELECT 1 FROM "product_attributes" WHERE "categoryId" = '13000000-0000-0000-0000-000000000999');