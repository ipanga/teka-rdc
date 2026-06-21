-- Town Architecture Refactor / P1 — backfill the data-driven town identity for
-- the two launch towns so the buyer apps keep the copper/cobalt accent + hero
-- after the hardcoded slug switches are removed (accent/hero now come from data).
-- Idempotent: only fills rows that haven't been set yet (won't clobber admin edits).

UPDATE "cities"
   SET "accentColor"  = 'copper',
       "heroImageUrl" = '/hero/lubumbashi.webp'
 WHERE "slug" = 'lubumbashi' AND "accentColor" IS NULL;

UPDATE "cities"
   SET "accentColor"  = 'cobalt',
       "heroImageUrl" = '/hero/kolwezi.webp'
 WHERE "slug" = 'kolwezi' AND "accentColor" IS NULL;
