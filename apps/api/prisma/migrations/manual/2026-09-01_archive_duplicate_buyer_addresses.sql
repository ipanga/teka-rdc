-- Archive duplicate BUYER addresses (keep exactly one current address each)
--
-- NOT auto-applied. This mutates data, so it ships via the "Apply prod
-- migration" workflow, and only AFTER the detection query below has been run
-- and its result reviewed. Deploy order: the snapshot migration and the API
-- that writes snapshots must be live first, so no order loses its delivery
-- address when the extra rows stop being surfaced.
--
-- Measured before writing this (2026-09-01):
--   production — 1 buyer, holding 2 active addresses; 9 orders; 2 addresses
--                each referenced by more than one order
--   development — 2 buyers (one with 2 addresses), 2 sellers with 1 each
--
-- SAFETY
--   * BUYER role only. Sellers/admins are untouched: the single-address rule is
--     a buyer product decision.
--   * Soft delete only — sets "deletedAt". No row is removed, so every
--     orders.deliveryAddressId FK still resolves and order history is intact.
--     Reversible with: UPDATE addresses SET "deletedAt" = NULL WHERE id IN (...)
--   * Keeps the row the app already treats as current: isDefault first, then
--     most recently created — identical to the ordering in
--     AddressesService.findAll and the buyer's auto-selected checkout address.
--   * Idempotent: re-running finds no buyer with >1 active address and is a
--     no-op. It also only ever touches rows that are currently active.
--
-- DETECTION (run first, expect the "after" count to be zero):
--   SELECT a."userId", COUNT(*) FROM addresses a
--     JOIN users u ON u.id = a."userId"
--    WHERE a."deletedAt" IS NULL AND u.role = 'BUYER'
--    GROUP BY 1 HAVING COUNT(*) > 1;

WITH ranked AS (
  SELECT
    a."id",
    ROW_NUMBER() OVER (
      PARTITION BY a."userId"
      ORDER BY a."isDefault" DESC, a."createdAt" DESC, a."id"
    ) AS rn
  FROM "addresses" a
  JOIN "users" u ON u."id" = a."userId"
  WHERE a."deletedAt" IS NULL
    AND u."role" = 'BUYER'
)
UPDATE "addresses" t
SET "deletedAt" = NOW()
FROM ranked
WHERE t."id" = ranked."id"
  AND ranked.rn > 1
  AND t."deletedAt" IS NULL;

-- Promote each buyer's surviving address to default, so checkout auto-selects
-- it even where the kept row was not previously flagged.
UPDATE "addresses" t
SET "isDefault" = TRUE
FROM "users" u
WHERE u."id" = t."userId"
  AND u."role" = 'BUYER'
  AND t."deletedAt" IS NULL
  AND t."isDefault" = FALSE;
