import { readFileSync } from 'fs';
import { join } from 'path';
import {
  renderAttributeSql,
  renderKeywordSql,
} from '../../../prisma/scripts/taxonomy-attribute-sql';
import { STRICT_CATEGORIES } from '../../../prisma/taxonomy-data';

/**
 * Seller Catalogue Speed-up, PR D (2026-09-27): the migration that ships the
 * laundry type, « Alimentation bébé » and the category search aliases must be
 * what `taxonomy-data.ts` says — generated, never transcribed — and safe to
 * auto-apply before the rolling swap.
 */
const MANUAL_DIR = join(__dirname, '../../../prisma/migrations/manual');
const FILE = '2026-09-27_taxonomy_laundry_babyfood_keywords.sql';
const COLUMN = '2026-09-27_category_search_keywords.sql';
const sql = readFileSync(join(MANUAL_DIR, FILE), 'utf8');

const block = (begin: string, end: string) => {
  const m = sql.match(new RegExp(`-- ${begin}[^\\n]*\\n([\\s\\S]*?)\\n-- ${end}`));
  if (!m) throw new Error(`no ${begin} markers`);
  return m[1].trim();
};
const executable = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const KEYWORD_LEAVES = STRICT_CATEGORIES.flatMap((c) =>
  c.subs.flatMap((s) => s.types.filter((t) => (t.kw ?? []).length).map((t) => t.n)),
);

describe('2026-09-27 laundry / baby food / aliases migration', () => {
  it('its characteristics are a fresh render of taxonomy-data.ts', () => {
    expect(block('GENERATED BLOCK BEGIN', 'GENERATED BLOCK END')).toBe(
      renderAttributeSql([10401, 10505]).trim(),
    );
  });

  it('its aliases are a fresh render — for EVERY leaf that declares some', () => {
    expect(block('GENERATED KEYWORDS BEGIN', 'GENERATED KEYWORDS END')).toBe(
      renderKeywordSql(KEYWORD_LEAVES).trim(),
    );
  });

  it('never overwrites aliases an admin has edited', () => {
    const updates = executable.match(/UPDATE "categories"[^;]*;/g) ?? [];
    expect(updates.length).toBe(KEYWORD_LEAVES.length);
    for (const u of updates) expect(u).toContain(`"searchKeywords" = '{}'`);
  });

  it('is additive: no executable DELETE / DROP / TRUNCATE / ALTER, no product or specification write', () => {
    expect(executable).not.toMatch(/\b(DELETE|DROP|TRUNCATE|ALTER)\b/i);
    expect(executable).not.toMatch(/"products"|"product_specifications"/);
  });

  it('refuses before writing on an unexpected pre-state, inside one transaction', () => {
    const begin = executable.indexOf('BEGIN;');
    const guard = executable.indexOf('RAISE EXCEPTION');
    const firstWrite = executable.indexOf('INSERT INTO');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThan(begin);
    expect(firstWrite).toBeGreaterThan(guard);
    expect(executable.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('runs after the column it writes, in the auto-apply manifest', () => {
    const list = readFileSync(join(MANUAL_DIR, 'auto-apply.list'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    expect(list.indexOf(FILE)).toBeGreaterThan(list.indexOf(COLUMN));
    expect(list.indexOf(COLUMN)).toBeGreaterThanOrEqual(0);
  });
});
