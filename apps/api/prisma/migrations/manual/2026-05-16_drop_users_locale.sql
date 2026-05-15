-- Drop stale users.locale column (2026-05-16).
--
-- Context: the column was removed from `schema.prisma` during the April
-- monolingual refactor (commit 7293c67, see CLAUDE.md "May 2026 — Platform
-- reduced to French only"). The migration that should have dropped it from
-- the database was never run, so dev (and possibly prod) still carries the
-- column with a handful of legacy non-null values.
--
-- Effect: drops the column unconditionally. The Prisma client has not
-- referenced `User.locale` since the April refactor, so no application
-- code path relies on it. Any remaining row values are lost — they are
-- presumed to be 'fr' anyway since the platform shipped FR-only on
-- 2026-04-25 and dropped all multi-locale UI plumbing on 2026-05-14.
--
-- Idempotent: `DROP COLUMN IF EXISTS` is a no-op on databases where the
-- column has already been removed.
--
-- Run on the VPS via:
--   bash scripts/run-prod-sql.sh apps/api/prisma/migrations/manual/2026-05-16_drop_users_locale.sql

BEGIN;

ALTER TABLE users DROP COLUMN IF EXISTS locale;

COMMIT;
