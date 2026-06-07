-- Populate production delivery_zones with the pricing already defined in seed.ts
-- (2026-06-07). The prod delivery_zones table was empty, so every order — and
-- now every checkout quote — fell back to the 5,000 CDF default. This loads the
-- existing pricing configuration; it is NOT a delivery-model redesign.
--
-- Values + deterministic IDs are byte-for-byte the seed.ts set
-- (seedDeliveryZones, dzId(n) = 60000000-0000-0000-0000-<n padded to 12>).
-- feeCDF / feeUSD are BigInt centimes (CDF) / cents (USD).
--
-- Run on prod via the "Apply prod migration" GitHub Action.
--
-- Idempotent: ON CONFLICT (fromTown, toTown) DO UPDATE re-applies the canonical
-- fee on every run without creating duplicates. Safe to re-run.

INSERT INTO "delivery_zones" ("id", "fromTown", "toTown", "feeCDF", "feeUSD", "isActive", "createdAt", "updatedAt")
VALUES
  ('60000000-0000-0000-0000-000000000001', 'Lubumbashi', 'Lubumbashi',  300000,  120, true, now(), now()),
  ('60000000-0000-0000-0000-000000000002', 'Lubumbashi', 'Likasi',      800000,  320, true, now(), now()),
  ('60000000-0000-0000-0000-000000000003', 'Lubumbashi', 'Kolwezi',    1500000,  600, true, now(), now()),
  ('60000000-0000-0000-0000-000000000004', 'Likasi',     'Likasi',      300000,  120, true, now(), now()),
  ('60000000-0000-0000-0000-000000000005', 'Likasi',     'Lubumbashi',  800000,  320, true, now(), now()),
  ('60000000-0000-0000-0000-000000000006', 'Likasi',     'Kolwezi',    1200000,  480, true, now(), now()),
  ('60000000-0000-0000-0000-000000000007', 'Kolwezi',    'Kolwezi',     300000,  120, true, now(), now()),
  ('60000000-0000-0000-0000-000000000008', 'Kolwezi',    'Lubumbashi', 1500000,  600, true, now(), now()),
  ('60000000-0000-0000-0000-000000000009', 'Kolwezi',    'Likasi',     1200000,  480, true, now(), now()),
  ('60000000-0000-0000-0000-000000000010', 'Lubumbashi', 'Kipushi',     500000,  200, true, now(), now()),
  ('60000000-0000-0000-0000-000000000011', 'Lubumbashi', 'Kasumbalesa', 600000,  240, true, now(), now()),
  ('60000000-0000-0000-0000-000000000012', 'Likasi',     'Kambove',     400000,  160, true, now(), now())
ON CONFLICT ("fromTown", "toTown") DO UPDATE
  SET "feeCDF"    = EXCLUDED."feeCDF",
      "feeUSD"    = EXCLUDED."feeUSD",
      "isActive"  = true,
      "updatedAt" = now();
