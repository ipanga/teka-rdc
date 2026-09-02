-- Historical bookkeeping backfill for `_manual_migrations`
--
-- BOOKKEEPING ONLY. This migration touches exactly one table,
-- `_manual_migrations`, and writes nothing else. It contains no application
-- data change: no product, order, user, brand, category or specification row is
-- read or written.
--
-- WHY
--   `Apply prod migration` (apply-migration.yml) did not record what it applied
--   until 2026-09-02 (PR #621). Every migration run through it before that is
--   therefore missing from `_manual_migrations`, even though it was applied to
--   production. This restores those rows so the table is a complete answer to
--   "has this file been applied to this database?", which is also what a future
--   auto-apply run consults before deciding to skip a file.
--
-- EVIDENCE
--   Each row below corresponds to a SUCCESSFUL GitHub Actions run of
--   apply-migration.yml. Every entry was verified individually by:
--     * confirming the run's conclusion is `success`;
--     * parsing "> applying prisma/migrations/manual/<file>" out of that run's
--       log, so the filename comes from the run itself rather than from a
--       human list;
--     * confirming the run's "migration applied" marker is present;
--     * confirming the file is not already recorded.
--   The run id is kept inline so every claim stays auditable.
--
-- applied_at is the WORKFLOW RUN TIMESTAMP, not now(), and not a date inferred
-- from the filename. Two files were executed on a different day from the date
-- in their name, and the run timestamp is authoritative for both:
--   2026-07-23_prune-non-leaf-attributes.sql        -> ran 2026-07-24 19:55:00Z
--   2026-09-03_remediate_legacy_category_products.sql -> ran 2026-09-02 18:41:42Z
--
-- DELIBERATELY EXCLUDED — 9 of the 39 files in manual/ are NOT listed here,
-- because there is no run-log evidence that they were applied to production:
--   2026-04-25_drop_en_jsonb.sql            2026-05-12_buyer_email_auth.sql
--   2026-04-26_drop_user_locale.sql         2026-05-15_whatsapp_otp_buyer.sql
--   2026-04-28_probe_english_residue.sql    2026-05-16_drop_users_locale.sql
--   2026-05-04_update_admin_email.sql       2026-05-20_user_notification_prefs.sql
--   2026-06-23_translatable_jsonstring_to_fr.sql
--   Eight predate this workflow entirely (its first run is 2026-05-21) and were
--   applied by hand over SSH if at all. The ninth is documented in CLAUDE.md as
--   DEV-ONLY ("prod was already clean"). Absence from `_manual_migrations` is
--   not evidence a file should be marked applied — and recording one that never
--   ran is the single dangerous direction here, because a future auto-apply run
--   would then skip it.
--
-- SAFETY
--   * Idempotent: ON CONFLICT (filename) DO NOTHING. A second run inserts 0.
--   * Non-destructive: INSERT only. No UPDATE, no DELETE, no DDL beyond a
--     defensive CREATE TABLE IF NOT EXISTS matching apply-auto.sh.
--   * Reversible, if ever needed:
--       DELETE FROM _manual_migrations WHERE filename IN (<the 26 below>);
--     No other table is affected, so nothing else needs undoing.
--
-- Expected: INSERT 0 26 on the first run, INSERT 0 0 thereafter.
-- Row count goes 4 -> 30 (and 31 once this file records itself; see below).

BEGIN;

-- Defensive: same shape apply-auto.sh creates, so this file can also be run on
-- a database that has never had an auto-apply migration.
CREATE TABLE IF NOT EXISTS _manual_migrations (
  filename   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO _manual_migrations (filename, applied_at) VALUES
  ('2026-05-21_device_tokens.sql',                      '2026-05-21 21:17:12+00'),  -- run 26253625102
  ('2026-05-25_broadcast_channels.sql',                 '2026-05-25 20:31:10+00'),  -- run 26418622911
  ('2026-06-06_city_first_urls.sql',                    '2026-06-06 19:55:37+00'),  -- run 27072311052
  ('2026-06-07_seed_delivery_zones.sql',                '2026-06-07 09:16:26+00'),  -- run 27088396194
  ('2026-06-07_seller_commune.sql',                     '2026-06-07 15:07:27+00'),  -- run 27096264659
  ('2026-06-07_seller_kyc_document.sql',                '2026-06-07 16:59:21+00'),  -- run 27098969953
  ('2026-06-07_product_is_demo.sql',                    '2026-06-07 18:21:41+00'),  -- run 27100910579
  ('2026-06-07_product_units_sold.sql',                 '2026-06-07 19:33:17+00'),  -- run 27102595551
  ('2026-06-07_product_search_fts.sql',                 '2026-06-07 20:27:28+00'),  -- run 27103875879
  ('2026-06-07_product_search_unaccent.sql',            '2026-06-07 20:44:05+00'),  -- run 27104281946
  ('2026-06-08_seller_payout_destination.sql',          '2026-06-08 20:44:53+00'),  -- run 27165838494
  ('2026-06-14_taxonomy_brand_foundation.sql',          '2026-06-14 16:56:21+00'),  -- run 27505762559
  ('2026-06-18_admin_notifications.sql',                '2026-06-18 12:40:26+00'),  -- run 27760091659
  ('2026-06-18_user_notifications.sql',                 '2026-06-18 19:15:20+00'),  -- run 27783417962
  ('2026-06-21_town_architecture.sql',                  '2026-06-21 16:48:14+00'),  -- run 27910994404
  ('2026-06-21_town_identity_backfill.sql',             '2026-06-21 16:52:23+00'),  -- run 27911102869
  ('2026-06-23_product_discount_price.sql',             '2026-06-23 14:12:15+00'),  -- run 28032607907
  ('2026-06-23_broadcast_notifications.sql',            '2026-06-23 15:32:38+00'),  -- run 28037292446
  ('2026-06-24_search_synonyms_and_logging.sql',        '2026-06-24 15:22:09+00'),  -- run 28109441393
  ('2026-06-24_product_lifecycle.sql',                  '2026-06-24 20:32:01+00'),  -- run 28127725762
  ('2026-06-29_managed-order-workflow.sql',             '2026-06-29 20:38:08+00'),  -- run 28401107198
  ('2026-07-04_order_idempotency_per_seller.sql',       '2026-07-04 20:25:37+00'),  -- run 28718629477
  ('2026-07-23_prune-non-leaf-attributes.sql',          '2026-07-24 19:55:00+00'),  -- run 30121963437
  ('2026-09-01_archive_duplicate_buyer_addresses.sql',  '2026-09-01 20:15:40+00'),  -- run 33554264282
  ('2026-09-02_prune_invalid_brand_category_links.sql', '2026-09-02 18:38:37+00'),  -- run 33668468256
  ('2026-09-03_remediate_legacy_category_products.sql', '2026-09-02 18:41:42+00')  -- run 33668783372
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- NOTE ON THIS FILE ITSELF
--   Run through the updated `Apply prod migration` workflow, this migration will
--   ALSO be recorded — the workflow now inserts the dispatched filename after
--   the file succeeds. So production ends at 4 + 26 + 1 = 31 rows:
--   4 pre-existing, 26 backfilled here, and
--   `2026-09-04_backfill_manual_migrations.sql` recorded by the workflow.
