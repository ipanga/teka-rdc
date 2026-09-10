-- Brands + brand↔leaf links for the leaves added on 2026-09-10 (2026-09-11).
-- Initiative: docs/pre-scale-readiness.md — taxonomy/data quality, P2 follow-up 2.
--
-- WHY
--   `2026-09-10_taxonomy_milk_alcohol_deodorant.sql` created six leaves. Its
--   follow-up `2026-09-10_taxonomy_attribute_backfill.sql` gave them their
--   characteristics. Neither gave them BRANDS — the third relationship
--   `taxonomy-data.ts` declares and only `seed.ts` materialises.
--
--   Verified read-only in production: all six leaves have ZERO rows in
--   `brand_categories`, including the « Autre » catch-all, so the brand
--   dropdown on a milk or an alcohol is completely empty — a seller cannot even
--   pick "other". Nestlé exists and is linked to 3 of the 5 leaves it declares;
--   the two milk leaves are missing. Simba and Heineken do not exist at all.
--
-- BRAND IDENTITY — WHY 54/55 AND NOT 50/51
--   `taxonomy-data.ts` originally numbered Johnnie Walker 50 and Primus 51.
--   Both ids were ALREADY TAKEN in production by rows from the pre-2026-06-24
--   brand library, renamed `__old__…` and soft-deleted by the seed's rename
--   preamble rather than removed:
--
--     15000000-…-000000000050  __old__49__000050  (was Castrol)
--       └─ 2 soft-deleted demo products still reference it,
--          and ONE OF THEM APPEARS IN A REAL ORDER.
--     15000000-…-000000000051  __old__50__000051  (0 products)
--
--   `seed.ts` upserts a brand BY ID with `update: { name, slug, deletedAt: null }`,
--   so declaring Johnnie Walker as n=50 would rename Castrol to « Johnnie
--   Walker » and resurrect it on the next seed run — relabelling a product that
--   is part of order history. `OrderItem` snapshots `productTitle` but NOT the
--   brand, so the order line itself would still read correctly; the product row
--   behind it would not.
--
--   Reusing a historical id buys nothing. The two brands were therefore moved
--   to the first ids free in BOTH the source file and production — 54 and 55 —
--   in the same commit as this migration. The `__old__` rows are left exactly
--   as they are: not renamed, not reactivated, not deleted.
--
-- SHAPE
--   « Autre » (n=1) has an EMPTY `types` list, which `seed.ts` treats as "link
--   to every leaf". It is linked to 145 leaves in production and missing
--   exactly these six. Wine gets no branded entry because the source declares
--   none — « Autre » only. No brand is invented here.
--
-- ADDITIVE and IDEMPOTENT — two INSERTs, both `ON CONFLICT DO NOTHING`. No row
-- is updated, renamed, reactivated or deleted; no existing brand's name, logo
-- or sortOrder is rewritten; no product changes. Safe before the rolling swap.
--
-- NOT HAND-WRITTEN
--   Generated from `taxonomy-data.ts` by `prisma/scripts/taxonomy-attribute-sql.ts`
--   (`renderBrandSql`). `src/common/taxonomy/taxonomy-attribute-sql.spec.ts`
--   re-renders it in CI and fails on drift. Do not edit between the markers.
--
-- ROLLBACK at the bottom (commented).

-- ── brands + links ──────────────────────────────────────────────────────────
-- GENERATED BLOCK BEGIN — taxonomy-attribute-sql.ts renderBrandSql, leaves 10601,10602,10603,10701,10702,10703, new brands 52,53,54,55
INSERT INTO "brands" ("id", "name", "slug", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('15000000-0000-0000-0000-000000000052', 'Simba', 'simba', TRUE, 52, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000053', 'Heineken', 'heineken', TRUE, 53, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000054', 'Johnnie Walker', 'johnnie-walker', TRUE, 54, NOW(), NOW()),
  ('15000000-0000-0000-0000-000000000055', 'Primus', 'primus', TRUE, 55, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "brand_categories" ("brandId", "categoryId")
VALUES
  ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010601'),  -- Autre → 10601
  ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010602'),  -- Autre → 10602
  ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010603'),  -- Autre → 10603
  ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010701'),  -- Autre → 10701
  ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010702'),  -- Autre → 10702
  ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010703'),  -- Autre → 10703
  ('15000000-0000-0000-0000-000000000047', '16000000-0000-0000-0000-000000010601'),  -- Nestlé → 10601
  ('15000000-0000-0000-0000-000000000047', '16000000-0000-0000-0000-000000010602'),  -- Nestlé → 10602
  ('15000000-0000-0000-0000-000000000052', '16000000-0000-0000-0000-000000010701'),  -- Simba → 10701
  ('15000000-0000-0000-0000-000000000053', '16000000-0000-0000-0000-000000010701'),  -- Heineken → 10701
  ('15000000-0000-0000-0000-000000000054', '16000000-0000-0000-0000-000000010703'),  -- Johnnie Walker → 10703
  ('15000000-0000-0000-0000-000000000055', '16000000-0000-0000-0000-000000010701')  -- Primus → 10701
ON CONFLICT ("brandId", "categoryId") DO NOTHING;
-- GENERATED BLOCK END

-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (run by hand only; not part of any automatic path)
--
-- -- the 12 links this migration created
-- DELETE FROM "brand_categories"
--  WHERE ("brandId", "categoryId") IN (
--    ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010601'),
--    ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010602'),
--    ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010603'),
--    ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010701'),
--    ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010702'),
--    ('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000010703'),
--    ('15000000-0000-0000-0000-000000000047', '16000000-0000-0000-0000-000000010601'),
--    ('15000000-0000-0000-0000-000000000047', '16000000-0000-0000-0000-000000010602'),
--    ('15000000-0000-0000-0000-000000000052', '16000000-0000-0000-0000-000000010701'),
--    ('15000000-0000-0000-0000-000000000053', '16000000-0000-0000-0000-000000010701'),
--    ('15000000-0000-0000-0000-000000000054', '16000000-0000-0000-0000-000000010703'),
--    ('15000000-0000-0000-0000-000000000055', '16000000-0000-0000-0000-000000010701')
--  );
--
-- -- the 4 brands this migration created. Safe ONLY while no product references
-- -- them; check first:
-- --   SELECT "brandId", count(*) FROM "products"
-- --    WHERE "brandId" IN ('15000000-0000-0000-0000-000000000052',
-- --                        '15000000-0000-0000-0000-000000000053',
-- --                        '15000000-0000-0000-0000-000000000054',
-- --                        '15000000-0000-0000-0000-000000000055')
-- --    GROUP BY "brandId";
-- -- If any row comes back, soft-delete instead of deleting:
-- --   UPDATE "brands" SET "isActive" = FALSE, "deletedAt" = NOW() WHERE "id" IN (…);
-- DELETE FROM "brands"
--  WHERE "id" IN (
--    '15000000-0000-0000-0000-000000000052',
--    '15000000-0000-0000-0000-000000000053',
--    '15000000-0000-0000-0000-000000000054',
--    '15000000-0000-0000-0000-000000000055'
--  );
