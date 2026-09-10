import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { AttributeType } from '@prisma/client';
import {
  attributeIdFor,
  attributeRowsFor,
  renderAttributeSql,
  strictAttrId,
  strictTypeId,
} from '../../../prisma/scripts/taxonomy-attribute-sql';
import { STRICT_CATEGORIES } from '../../../prisma/taxonomy-data';

/**
 * Product-characteristic materialisation guards (2026-09-10, P2 follow-up).
 *
 * `2026-09-10_taxonomy_milk_alcohol_deodorant.sql` created six new product-type
 * leaves in production and no `product_attributes` rows for any of them, so
 * every seller listing a milk or an alcohol got an empty characteristics form.
 * The cause is structural: the templates live in `taxonomy-data.ts` and only
 * `seed.ts` reads them, while production taxonomy changes ship as hand-written
 * SQL. Nothing connected the two.
 *
 * These tests are that connection. The migration's SQL is GENERATED from
 * `taxonomy-data.ts` and re-generated here for comparison, and the last test
 * fails any future migration that adds a leaf without its characteristics.
 */
const MANUAL_DIR = join(__dirname, '../../../prisma/migrations/manual');
const BACKFILL = '2026-09-10_taxonomy_attribute_backfill.sql';
const CATEGORY_MIGRATION = '2026-09-10_taxonomy_milk_alcohol_deodorant.sql';

/** The leaves the 2026-09-10 release added, plus the deodorant leaf it deduplicated. */
const BACKFILLED_TYPES = [10601, 10602, 10603, 10701, 10702, 10703, 60202];
const RETIRED_DUPLICATE = 10304;

const read = (file: string) => readFileSync(join(MANUAL_DIR, file), 'utf8');
const backfillSql = read(BACKFILL);

/** Extracts the generated statement from between the BEGIN/END markers. */
function generatedBlock(sql: string): string {
  const m = sql.match(/-- GENERATED BLOCK BEGIN[^\n]*\n([\s\S]*?)\n-- GENERATED BLOCK END/);
  if (!m) throw new Error('no GENERATED BLOCK markers in the migration');
  return m[1].trim();
}

/** Every leaf in the source of truth, flattened. */
const allLeaves = STRICT_CATEGORIES.flatMap((c) =>
  c.subs.flatMap((s) => s.types.map((t) => ({ ...t, sub: s.fr, dept: c.fr }))),
);

describe('the generated SQL is the source of truth, not a transcription', () => {
  it('1. the committed migration matches a fresh render of taxonomy-data.ts', () => {
    // The whole point: this fails the moment the templates and the shipped SQL
    // disagree, which is the failure mode that produced the bug.
    expect(generatedBlock(backfillSql)).toBe(renderAttributeSql(BACKFILLED_TYPES).trim());
  });

  it('2. the deterministic ids use seed.ts\'s formula, typeKey * 100 + slot + 1', () => {
    expect(attributeIdFor(10601, 0)).toBe('14000000-0000-0000-0000-000001060101');
    expect(attributeIdFor(60202, 3)).toBe('14000000-0000-0000-0000-000006020204');
    expect(attributeIdFor(10703, 1)).toBe(strictAttrId(10703 * 100 + 2));
    // and every emitted row agrees with it
    for (const row of attributeRowsFor(BACKFILLED_TYPES)) {
      expect(row.id).toBe(attributeIdFor(row.typeKey, row.sortOrder - 1));
      expect(row.categoryId).toBe(strictTypeId(row.typeKey));
    }
  });

  it('3. generating SQL for a leaf that is not in taxonomy-data.ts throws', () => {
    // Silently emitting nothing is precisely how 26 rows went missing.
    expect(() => attributeRowsFor([99999])).toThrow(/not defined in taxonomy-data/);
  });
});

describe('the migration is safe to auto-apply', () => {
  it('4. it is idempotent — the only write is an INSERT … ON CONFLICT DO UPDATE', () => {
    const stmt = generatedBlock(backfillSql);
    expect(stmt).toMatch(/^INSERT INTO "product_attributes"/);
    expect(stmt).toMatch(/ON CONFLICT \("id"\) DO UPDATE/);
    // exactly one statement
    expect(stmt.match(/;/g)).toHaveLength(1);
  });

  it('5. it is additive — no executable DELETE, DROP, TRUNCATE or UPDATE of other tables', () => {
    const executable = backfillSql
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    expect(executable).not.toMatch(/\b(DELETE|DROP|TRUNCATE|ALTER)\b/i);
    // it touches product_attributes and nothing else
    expect(executable.match(/INSERT INTO "(\w+)"/g)).toEqual(['INSERT INTO "product_attributes"']);
    expect(executable).not.toMatch(/INTO "products"|INTO "categories"|"product_specifications"/);
  });

  it('6. it is registered in auto-apply.list AFTER the migration that creates the leaves', () => {
    const list = read('auto-apply.list')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    expect(list).toContain(BACKFILL);
    expect(list.indexOf(BACKFILL)).toBeGreaterThan(list.indexOf(CATEGORY_MIGRATION));
  });
});

describe('the characteristics themselves', () => {
  const rows = attributeRowsFor(BACKFILLED_TYPES);
  const forType = (n: number) => rows.filter((r) => r.typeKey === n);

  it('7. the canonical Déodorants leaf gets the deodorant template, not the consumable one', () => {
    // Production holds « Volume » + « Date d'expiration » on this leaf — the
    // generic CONSUMABLE shape. An expiry date is not what a buyer filters a
    // deodorant by.
    expect(forType(60202).map((r) => [r.name, r.type])).toEqual([
      ['Format', AttributeType.SELECT],
      ['Volume', AttributeType.TEXT],
      ['Anti-transpirant', AttributeType.BOOLEAN],
      ['Parfum', AttributeType.TEXT],
    ]);
    expect(forType(60202).map((r) => r.name)).not.toContain("Date d'expiration");
  });

  it('8. the two stale deodorant rows are corrected in place, by id', () => {
    // They already exist in production, so the DO UPDATE arm must reach them.
    const stmt = generatedBlock(backfillSql);
    expect(stmt).toContain("'14000000-0000-0000-0000-000006020201', '16000000-0000-0000-0000-000000060202', 'Format'");
    expect(stmt).toContain("'14000000-0000-0000-0000-000006020202', '16000000-0000-0000-0000-000000060202', 'Volume'");
    expect(stmt).toMatch(/"name"\s+= EXCLUDED\."name"/);
    expect(stmt).toMatch(/"type"\s+= EXCLUDED\."type"/);
    expect(stmt).toMatch(/"options"\s+= EXCLUDED\."options"/);
  });

  it('9. the three alcohol leaves keep their own distinct templates', () => {
    // Guards against the easy shortcut of copying one template across the
    // branch: a beer has no origin country and no colour-style « Type ».
    const beer = forType(10701).map((r) => r.name);
    const wine = forType(10702).map((r) => r.name);
    const spirit = forType(10703).map((r) => r.name);
    expect(beer).toEqual(['Volume', "Degré d'alcool"]);
    expect(beer).not.toContain("Pays d'origine");
    expect(wine).toEqual(['Type', 'Volume', "Degré d'alcool", "Pays d'origine"]);
    expect(spirit).toEqual(['Type', 'Volume', "Degré d'alcool", "Pays d'origine"]);
    // same field names, different vocabularies
    const wineOptions = forType(10702).find((r) => r.name === 'Type')!.options;
    const spiritOptions = forType(10703).find((r) => r.name === 'Type')!.options;
    expect(wineOptions).toContain('Rouge');
    expect(spiritOptions).toContain('Whisky');
    expect(wineOptions).not.toEqual(spiritOptions);
  });

  it('10. every SELECT/MULTISELECT carries options and nothing else does', () => {
    for (const row of rows) {
      const choice =
        row.type === AttributeType.SELECT || row.type === AttributeType.MULTISELECT;
      if (choice) {
        expect(row.options).not.toBeNull();
        expect(row.options!.length).toBeGreaterThan(1);
      } else {
        // NULL, not a leftover list from a previous template.
        expect(row.options).toBeNull();
      }
    }
    // and that survives into the SQL
    expect(generatedBlock(backfillSql)).toMatch(/'TEXT'::"AttributeType", NULL/);
  });

  it('11. the retired duplicate deodorant leaf gets no characteristics', () => {
    // 10304 is deactivated. Materialising attributes on it would resurrect the
    // duplication the previous migration removed.
    expect(BACKFILLED_TYPES).not.toContain(RETIRED_DUPLICATE);
    expect(generatedBlock(backfillSql)).not.toContain(strictTypeId(RETIRED_DUPLICATE));
    expect(generatedBlock(backfillSql)).not.toContain(`00000${RETIRED_DUPLICATE}`);
  });
});

describe('a future migration cannot add a leaf without its characteristics', () => {
  /**
   * The structural guard. It reads every manual migration, collects the
   * product-type leaves they INSERT, and requires each one's full attribute set
   * — as defined in taxonomy-data.ts — to be inserted by some manual migration
   * too. This is the test that would have failed on 2026-09-10.
   */
  const files = readdirSync(MANUAL_DIR).filter((f) => f.endsWith('.sql'));
  const allSql = files.map((f) => ({ file: f, sql: read(f) }));

  /** Ids appearing inside an INSERT INTO "<table>" statement. */
  function insertedIds(sql: string, table: string, prefix: string): string[] {
    const found = new Set<string>();
    const re = new RegExp(`INSERT INTO "${table}"[\\s\\S]*?;`, 'g');
    for (const stmt of sql.match(re) ?? []) {
      const body = stmt
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('--'))
        .join('\n');
      for (const id of body.match(new RegExp(`${prefix}-[0-9a-f-]{4,}`, 'g')) ?? []) {
        found.add(id.replace(/'/g, ''));
      }
    }
    return [...found];
  }

  const insertedLeafIds = new Set(
    allSql.flatMap(({ sql }) => insertedIds(sql, 'categories', '16000000')),
  );
  const insertedAttrIds = new Set(
    allSql.flatMap(({ sql }) => insertedIds(sql, 'product_attributes', '14000000')),
  );

  it('12. every product-type leaf inserted by a manual migration has its full attribute set inserted too', () => {
    expect(insertedLeafIds.size).toBeGreaterThan(0); // the guard is actually looking at something

    const missing: string[] = [];
    for (const leafId of insertedLeafIds) {
      const key = Number(leafId.split('-').pop());
      const leaf = allLeaves.find((l) => l.n === key);
      // A leaf absent from the source of truth is itself a defect.
      expect(leaf).toBeDefined();
      const attrs = leaf!.attrs ?? [];
      attrs.forEach((attr, slot) => {
        const id = attributeIdFor(key, slot);
        if (!insertedAttrIds.has(id)) {
          missing.push(`${leaf!.dept} > ${leaf!.sub} > ${leaf!.fr} — « ${attr.fr} » (${id})`);
        }
      });
    }
    expect(missing).toEqual([]);
  });
});
