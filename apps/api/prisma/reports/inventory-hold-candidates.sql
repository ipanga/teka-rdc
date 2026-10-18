-- =============================================================================
-- Inventory hold — historical CANDIDATE report (READ-ONLY, I3, 2026-10)
-- =============================================================================
--
-- PURPOSE. List orders whose checkout stock hold may have been restored zero
-- times or more than once, so ops can investigate product by product. It
-- reports SUSPICION and ESTIMATES, never proof, and corrects nothing.
--
-- MEASURED ONCE (2026-10-17, reviewed aggregate SELECT in a verified READ ONLY
-- transaction, all rollout boundaries unknown): 2 cancelled orders / 9 units
-- U_restoration_unproven. A candidate count, NOT proof that stock is missing;
-- nothing was corrected. Current Product.quantity is NOT evidence either way:
-- seller absolute stock edits, other sales and earlier restores all move it.
--
-- WHY ERAS MATTER (code history from git — commit dates, NOT deploy dates):
--   6f3992d (2026-02-28)  checkout deducts stock.
--   4058842 (2026-06-29)  buyer cancel, seller reject and admin cancel START
--                         restoring stock. Cancellations served by older code
--                         restored NOTHING.
--   da92541 (2026-06-29)  return approval (with restock) introduced.
--   I1      (2026-10)     every first CANCELLED/RETURNED entry restores once,
--                         forced ones included; later entries never.
--   forceStatusChange never restored stock before I1.
-- The moment each change reached production is unknown here. Supply it ONLY
-- from a verified deployment record; while a boundary is unset, every entry
-- that depends on it is classified as unproven instead of "restored".
--
-- PARAMETERS (psql -v name='YYYY-MM-DD HH:MI:SS', UTC as stored; empty or
-- absent = UNVERIFIED):
--   cancel_restock_verified_since  first instant 4058842 served cancellations
--   return_restock_verified_since  first instant da92541 served approvals
--   i1_fix_deployed_at             first instant I1 served all paths
--
-- ENTRY CLASSIFICATION (each status log INTO CANCELLED/RETURNED; the path is
-- guessed from actor + note — an ESTIMATE, a note proves nothing):
--   post_fix_restored     ≥ i1_fix_deployed_at and the order's first release
--   post_fix_skipped      ≥ i1_fix_deployed_at, not first → never restored
--   forced_no_restore     looks forced/unknown (pre-I1)    → never restored
--   unproven_era          looks normal, but before (or without) a verified
--                         restock boundary for its path    → unknown
--   likely_restored_est   looks normal, after the verified boundary
--
-- ORDER CLASSES (estimates):
--   B_restored_more_than_once_suspected  ≥ 2 likely/post-fix restores
--   M_mixed_unproven_and_restored        1 restore + ≥ 1 unproven entry
--   U_restoration_unproven               0 restores, ≥ 1 unproven entry
--   A_hold_never_restored_suspected      0 restores, only forced/skipped
--   C_revived_after_release              left CANCELLED/RETURNED afterwards
--                                        (forced rewind) — goods may have
--                                        shipped after the stock came back
--   likely_normal_estimate               exactly one likely restore
--
-- PROCEDURE (separately authorised; never automatic):
--   1. Obtain verified deploy instants from the deployment log; leave any
--      you cannot verify empty.
--   2. Run with a READ-ONLY role:
--        psql "$READONLY_URL" -v ON_ERROR_STOP=1 \
--          -v cancel_restock_verified_since='…' -v return_restock_verified_since='…' \
--          -v i1_fix_deployed_at='…' -f inventory-hold-candidates.sql
--      The script is wrapped in a READ ONLY transaction ending in ROLLBACK.
--   3. Share only counts / order numbers internally — no buyer data.
--   4. Any stock correction is a separate, reviewed decision per product,
--      after a physical count. Never derive "quantity += units" from this.
--
-- Tested against synthetic rows on a throwaway local database by
-- apps/api/test/inventory-concurrency.pg-spec.ts (the @query blocks below are
-- executed verbatim, with the psql variables bound as parameters).
-- =============================================================================

\if :{?cancel_restock_verified_since}
\else
  \set cancel_restock_verified_since ''
\endif
\if :{?return_restock_verified_since}
\else
  \set return_restock_verified_since ''
\endif
\if :{?i1_fix_deployed_at}
\else
  \set i1_fix_deployed_at ''
\endif

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';

-- @query:summary
WITH params AS (
  SELECT
    NULLIF(:'cancel_restock_verified_since', '')::timestamp AS cancel_since,
    NULLIF(:'return_restock_verified_since', '')::timestamp AS return_since,
    NULLIF(:'i1_fix_deployed_at', '')::timestamp AS fix_at
),
releasing AS (
  SELECT
    l."orderId",
    l."createdAt",
    ROW_NUMBER() OVER (PARTITION BY l."orderId" ORDER BY l."createdAt", l.id) AS n,
    CASE
      WHEN l."toStatus" = 'CANCELLED' AND l."changedBy" = o."buyerId" THEN 'cancel'
      WHEN l."toStatus" = 'CANCELLED' AND l."changedBy" = o."sellerId"
           AND l.note LIKE 'Rejetée par le vendeur : %' THEN 'cancel'
      WHEN l."toStatus" = 'CANCELLED'
           AND l.note LIKE 'Annulée par l''administrateur : %' THEN 'cancel'
      WHEN l."toStatus" = 'RETURNED' AND l.note LIKE 'Retour approuvé%' THEN 'return'
      ELSE 'forced'
    END AS looks_like
  FROM order_status_logs l
  JOIN orders o ON o.id = l."orderId"
  WHERE l."toStatus" IN ('CANCELLED', 'RETURNED')
),
entries AS (
  SELECT
    r."orderId",
    r."createdAt",
    CASE
      WHEN p.fix_at IS NOT NULL AND r."createdAt" >= p.fix_at THEN
        CASE WHEN r.n = 1 THEN 'post_fix_restored' ELSE 'post_fix_skipped' END
      WHEN r.looks_like = 'forced' THEN 'forced_no_restore'
      WHEN r.looks_like = 'cancel'
           AND (p.cancel_since IS NULL OR r."createdAt" < p.cancel_since) THEN 'unproven_era'
      WHEN r.looks_like = 'return'
           AND (p.return_since IS NULL OR r."createdAt" < p.return_since) THEN 'unproven_era'
      ELSE 'likely_restored_est'
    END AS entry_class
  FROM releasing r
  CROSS JOIN params p
),
per_order AS (
  SELECT
    "orderId",
    COUNT(*) FILTER (WHERE entry_class IN ('likely_restored_est', 'post_fix_restored')) AS restores,
    COUNT(*) FILTER (WHERE entry_class = 'unproven_era') AS unproven,
    MIN("createdAt") AS first_release_at
  FROM entries
  GROUP BY "orderId"
),
revived AS (
  SELECT DISTINCT "orderId" FROM order_status_logs
  WHERE "fromStatus" IN ('CANCELLED', 'RETURNED')
),
classified AS (
  SELECT
    po."orderId",
    CASE
      WHEN po.restores > 1 THEN 'B_restored_more_than_once_suspected'
      WHEN po.restores = 1 AND po.unproven > 0 THEN 'M_mixed_unproven_and_restored'
      WHEN po.restores = 0 AND po.unproven > 0 THEN 'U_restoration_unproven'
      WHEN po.restores = 0 THEN 'A_hold_never_restored_suspected'
      WHEN rv."orderId" IS NOT NULL THEN 'C_revived_after_release'
      ELSE 'likely_normal_estimate'
    END AS classification
  FROM per_order po
  LEFT JOIN revived rv ON rv."orderId" = po."orderId"
)
SELECT
  c.classification,
  COUNT(*)::int AS orders,
  COALESCE(SUM(i.units), 0)::int AS units
FROM classified c
LEFT JOIN (
  SELECT "orderId", SUM(quantity) AS units FROM order_items GROUP BY "orderId"
) i ON i."orderId" = c."orderId"
GROUP BY c.classification
ORDER BY c.classification;
-- @end

-- @query:candidates
WITH params AS (
  SELECT
    NULLIF(:'cancel_restock_verified_since', '')::timestamp AS cancel_since,
    NULLIF(:'return_restock_verified_since', '')::timestamp AS return_since,
    NULLIF(:'i1_fix_deployed_at', '')::timestamp AS fix_at
),
releasing AS (
  SELECT
    l."orderId",
    l."createdAt",
    ROW_NUMBER() OVER (PARTITION BY l."orderId" ORDER BY l."createdAt", l.id) AS n,
    CASE
      WHEN l."toStatus" = 'CANCELLED' AND l."changedBy" = o."buyerId" THEN 'cancel'
      WHEN l."toStatus" = 'CANCELLED' AND l."changedBy" = o."sellerId"
           AND l.note LIKE 'Rejetée par le vendeur : %' THEN 'cancel'
      WHEN l."toStatus" = 'CANCELLED'
           AND l.note LIKE 'Annulée par l''administrateur : %' THEN 'cancel'
      WHEN l."toStatus" = 'RETURNED' AND l.note LIKE 'Retour approuvé%' THEN 'return'
      ELSE 'forced'
    END AS looks_like
  FROM order_status_logs l
  JOIN orders o ON o.id = l."orderId"
  WHERE l."toStatus" IN ('CANCELLED', 'RETURNED')
),
entries AS (
  SELECT
    r."orderId",
    r."createdAt",
    r.n,
    CASE
      WHEN p.fix_at IS NOT NULL AND r."createdAt" >= p.fix_at THEN
        CASE WHEN r.n = 1 THEN 'post_fix_restored' ELSE 'post_fix_skipped' END
      WHEN r.looks_like = 'forced' THEN 'forced_no_restore'
      WHEN r.looks_like = 'cancel'
           AND (p.cancel_since IS NULL OR r."createdAt" < p.cancel_since) THEN 'unproven_era'
      WHEN r.looks_like = 'return'
           AND (p.return_since IS NULL OR r."createdAt" < p.return_since) THEN 'unproven_era'
      ELSE 'likely_restored_est'
    END AS entry_class
  FROM releasing r
  CROSS JOIN params p
),
per_order AS (
  SELECT
    "orderId",
    COUNT(*) FILTER (WHERE entry_class IN ('likely_restored_est', 'post_fix_restored')) AS restores,
    COUNT(*) FILTER (WHERE entry_class = 'unproven_era') AS unproven,
    STRING_AGG(entry_class, ' → ' ORDER BY n) AS entry_classes,
    MIN("createdAt") AS first_release_at
  FROM entries
  GROUP BY "orderId"
),
revived AS (
  SELECT DISTINCT "orderId" FROM order_status_logs
  WHERE "fromStatus" IN ('CANCELLED', 'RETURNED')
)
SELECT
  o."orderNumber" AS order_number,
  o.id AS order_id,
  o.status::text AS current_status,
  o."paymentStatus"::text AS current_payment_status,
  po.entry_classes,
  po.restores::int AS restores,
  po.unproven::int AS unproven,
  (rv."orderId" IS NOT NULL) AS revived_from_terminal,
  CASE
    WHEN po.restores > 1 THEN 'B_restored_more_than_once_suspected'
    WHEN po.restores = 1 AND po.unproven > 0 THEN 'M_mixed_unproven_and_restored'
    WHEN po.restores = 0 AND po.unproven > 0 THEN 'U_restoration_unproven'
    WHEN po.restores = 0 THEN 'A_hold_never_restored_suspected'
    ELSE 'C_revived_after_release'
  END AS classification,
  po.first_release_at,
  (
    SELECT STRING_AGG(i."productId"::text || ' ×' || i.quantity, ', ' ORDER BY i."productId")
    FROM order_items i WHERE i."orderId" = o.id
  ) AS lines
FROM per_order po
JOIN orders o ON o.id = po."orderId"
LEFT JOIN revived rv ON rv."orderId" = po."orderId"
WHERE po.restores <> 1 OR po.unproven > 0 OR rv."orderId" IS NOT NULL
ORDER BY po.first_release_at;
-- @end

ROLLBACK;
