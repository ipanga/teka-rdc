/**
 * One-shot migration: translatable columns `jsonb {en, fr}` → plain `text` French.
 *
 * Context (2026-05-19): the monolingual French refactor updated the Prisma schema
 * to declare these columns as `String`, but no ALTER TABLE was ever run. The DB
 * still had `jsonb` columns holding `{"en":"...","fr":"..."}` objects. Prisma's
 * client silently stringified the JSONB on read, so every translatable field
 * rendered as raw `{"en":"...","fr":"..."}` JSON in the admin / seller UIs.
 *
 * This script does both data conversion and type migration in one atomic
 * ALTER TABLE per column:
 *   1. extracts French (or English fallback) from JSONB
 *   2. changes the column type to text
 *
 * Idempotent — skips columns already typed `text`.
 *
 * Usage:
 *   cd apps/api
 *   npx tsx prisma/scripts/migrate-jsonb-to-text.ts
 *
 * Or inside the api container (recommended for prod):
 *   docker compose -f docker-compose.prod.yml exec api \
 *     node /app/apps/api/dist/prisma/scripts/migrate-jsonb-to-text.js
 *
 * (Build the script first with `pnpm --filter api build` so dist/ exists, or
 * use the JS one-shot equivalent emitted via docker compose cp.)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const targets: { table: string; col: string }[] = [
  { table: 'products', col: 'title' },
  { table: 'products', col: 'description' },
  { table: 'categories', col: 'name' },
  { table: 'categories', col: 'description' },
  { table: 'cities', col: 'name' },
  { table: 'communes', col: 'name' },
  { table: 'banners', col: 'title' },
  { table: 'banners', col: 'subtitle' },
  { table: 'promotions', col: 'title' },
  { table: 'promotions', col: 'description' },
  { table: 'content_pages', col: 'title' },
  { table: 'content_pages', col: 'content' },
];

async function getColType(table: string, col: string): Promise<string | undefined> {
  const rows = await prisma.$queryRawUnsafe<{ data_type: string }[]>(
    `SELECT data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    table,
    col,
  );
  return rows[0]?.data_type;
}

async function migrateColumn(table: string, col: string): Promise<void> {
  const before = await getColType(table, col);
  if (!before) {
    console.log(`${table}.${col}: column not found, skipping`);
    return;
  }
  if (before === 'text') {
    console.log(`${table}.${col}: already text, skipping`);
    return;
  }
  if (before !== 'jsonb') {
    console.log(`${table}.${col}: unexpected type ${before}, skipping`);
    return;
  }

  // ALTER per-column so a failure on one doesn't roll back others.
  // COALESCE guarantees no data loss for malformed rows: prefer .fr, then .en,
  // finally fall back to the raw JSONB text representation.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ${table}
     ALTER COLUMN ${col} TYPE text
     USING COALESCE(${col}->>'fr', ${col}->>'en', ${col}::text)`,
  );
  const after = await getColType(table, col);
  console.log(`${table}.${col}: ${before} → ${after}`);
}

async function main(): Promise<void> {
  for (const { table, col } of targets) {
    try {
      await migrateColumn(table, col);
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n').slice(0, 3).join(' / ') : String(e);
      console.error(`${table}.${col}: ERROR — ${msg}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('FAIL:', e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
