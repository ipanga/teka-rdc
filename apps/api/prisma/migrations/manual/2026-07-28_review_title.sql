-- Review titles (2026-07-28)
--
-- Adds Review.title as a NULLABLE column. Additive, backward-compatible and
-- idempotent: it can be applied before the API that writes it (old code simply
-- never sets it) and re-run safely.
--
-- Nullable on purpose: reviews written before this date have no title and must
-- keep rendering without an empty gap. The API requires a title only for NEW
-- and EDITED reviews; it never backfills one, because inventing a title for
-- someone else's review would put words in a buyer's mouth.
--
-- No backfill, no default, no data migration. Rollback is a plain DROP COLUMN
-- (it loses titles written in the meantime, which is the expected cost).

ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "title" TEXT;
