import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { AttributeType } from '@prisma/client';
import {
  allLeafKeys,
  attributeIdFor,
  attributeRowsFor,
  brandLinksFor,
  brandsFor,
  renderAttributeSql,
  renderBrandSql,
  strictAttrId,
  strictBrandId,
  strictTypeId,
} from '../../../prisma/scripts/taxonomy-attribute-sql';
import { STRICT_BRANDS, STRICT_CATEGORIES } from '../../../prisma/taxonomy-data';

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
const BRAND_LINKS = '2026-09-11_taxonomy_brand_links.sql';
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


/**
 * Brand↔leaf links (2026-09-11, P2 follow-up 2).
 *
 * The same gap again: the 2026-09-10 migration created six leaves, and neither
 * it nor the attribute backfill created the brand relationships
 * `taxonomy-data.ts` declares for them. Production had ZERO `brand_categories`
 * rows on all six — including the « Autre » catch-all — so a seller listing a
 * beer could not pick any brand at all, not even "other".
 */
const NEW_LEAVES = [10601, 10602, 10603, 10701, 10702, 10703];
/** Brands verified absent from production, so the migration may create them. */
const NEW_BRANDS = [52, 53, 54, 55];
/**
 * The brands that migration was ABOUT. A shipped migration is immutable while
 * `taxonomy-data.ts` keeps growing — the 2026-09-11 beverage brands added more
 * links to « Bières » — so the drift check is pinned to this set rather than
 * relaxed into a subset comparison.
 */
const LINK_BRANDS = [1, 47, 52, 53, 54, 55];
const brandSql = read(BRAND_LINKS);
const linksFor = (leaf: number) =>
  brandLinksFor([leaf]).map((l) => l.brandName);

describe('brand links are derived from taxonomy-data.ts too', () => {
  it('13. the committed brand migration matches a fresh render', () => {
    expect(generatedBlock(brandSql)).toBe(renderBrandSql(NEW_LEAVES, NEW_BRANDS, LINK_BRANDS).trim());
  });

  it('14. Nestlé links to exactly the milk leaves the source declares — and no others', () => {
    const nestle = STRICT_BRANDS.find((b) => b.n === 47)!;
    expect(nestle.fr).toBe('Nestlé');
    // Declared: infant formula, coffee, cereal + the two new milk leaves.
    expect(nestle.types).toEqual([10503, 10204, 10105, 10601, 10602]);
    // Not powdered-vs-liquid only: « Lait concentré » is deliberately absent.
    expect(nestle.types).not.toContain(10603);
    expect(linksFor(10601)).toContain('Nestlé');
    expect(linksFor(10602)).toContain('Nestlé');
    expect(linksFor(10603)).not.toContain('Nestlé');
  });

  it('15. beer brands resolve for Bières', () => {
    const beer = linksFor(10701);
    expect(beer).toEqual(expect.arrayContaining(['Primus', 'Simba', 'Heineken']));
    // and they are beer-only — a lager is not a whisky
    expect(linksFor(10703)).not.toContain('Primus');
    expect(linksFor(10703)).not.toContain('Simba');
  });

  it('16. spirit brands resolve for Spiritueux', () => {
    expect(linksFor(10703)).toContain('Johnnie Walker');
    expect(linksFor(10701)).not.toContain('Johnnie Walker');
  });

  it('17. Vins gets the catch-all only — no brand is invented for it', () => {
    // The source declares no wine brand. Inventing one would be a data opinion,
    // not a migration.
    expect(linksFor(10702)).toEqual(['Autre']);
  });

  it('18. « Autre » reaches every one of the six leaves', () => {
    // An empty `types` list means "all leaves". Missing it is what left the
    // dropdown completely empty rather than merely short.
    const autre = STRICT_BRANDS.find((b) => b.fr === 'Autre')!;
    expect(autre.types).toEqual([]);
    for (const leaf of NEW_LEAVES) {
      expect(linksFor(leaf)).toContain('Autre');
    }
    expect(allLeafKeys()).toEqual(expect.arrayContaining(NEW_LEAVES));
  });

  it('19. no duplicate brand rows and no duplicate links are emitted', () => {
    const rows = brandsFor(NEW_LEAVES);
    expect(new Set(rows.map((b) => b.id)).size).toBe(rows.length);
    expect(new Set(rows.map((b) => b.name)).size).toBe(rows.length);
    expect(new Set(rows.map((b) => b.slug)).size).toBe(rows.length);

    const links = brandLinksFor(NEW_LEAVES);
    const keys = links.map((l) => `${l.brandId}|${l.categoryId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('20. re-running is a no-op — both statements are ON CONFLICT DO NOTHING', () => {
    const stmt = generatedBlock(brandSql);
    expect(stmt).toMatch(/INSERT INTO "brands"[\s\S]*ON CONFLICT \("id"\) DO NOTHING;/);
    expect(stmt).toMatch(
      /INSERT INTO "brand_categories"[\s\S]*ON CONFLICT \("brandId", "categoryId"\) DO NOTHING;/,
    );
    // DO NOTHING, never DO UPDATE: an existing brand keeps its live name, logo
    // and sortOrder. This migration adds links, it does not restyle the library.
    expect(stmt).not.toMatch(/DO UPDATE/);
  });

  it('21. it is additive — no executable DELETE/UPDATE/DROP, and only the two brand tables', () => {
    const executable = brandSql
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    expect(executable).not.toMatch(/\b(DELETE|UPDATE|DROP|TRUNCATE|ALTER)\b/i);
    expect(executable.match(/INSERT INTO "(\w+)"/g)).toEqual([
      'INSERT INTO "brands"',
      'INSERT INTO "brand_categories"',
    ]);
    // nothing touches products — the Johnnie Walker product keeps its identity
    expect(executable).not.toMatch(/"products"/);
  });

  it('22. it never reuses the occupied historical brand slots 50 and 51', () => {
    // Id 50 is the retired Castrol row: two soft-deleted demo products point at
    // it and one appears in a real order. `seed.ts` upserts brands BY ID with
    // `update: { name, deletedAt: null }`, so declaring a brand at n=50 would
    // rename and resurrect it on the next seed run.
    expect(STRICT_BRANDS.find((b) => b.n === 50)).toBeUndefined();
    expect(STRICT_BRANDS.find((b) => b.n === 51)).toBeUndefined();
    expect(STRICT_BRANDS.find((b) => b.fr === 'Johnnie Walker')!.n).toBe(54);
    expect(STRICT_BRANDS.find((b) => b.fr === 'Primus')!.n).toBe(55);

    const executable = brandSql
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    expect(executable).not.toContain(strictBrandId(50));
    expect(executable).not.toContain(strictBrandId(51));
  });

  it('23. only brands absent from production are inserted — existing rows are untouched', () => {
    const executable = brandSql
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    const brandInsert = executable.match(/INSERT INTO "brands"[\s\S]*?;/)![0];
    // Autre (1) and Nestlé (47) already exist: they get LINKS, not a row.
    expect(brandInsert).not.toContain(strictBrandId(1));
    expect(brandInsert).not.toContain(strictBrandId(47));
    for (const n of NEW_BRANDS) expect(brandInsert).toContain(strictBrandId(n));
  });

  it('24. unrelated leaves gain nothing — the render is scoped to the six', () => {
    const links = brandLinksFor(NEW_LEAVES);
    const leaves = new Set(links.map((l) => l.leafKey));
    expect([...leaves].sort()).toEqual([...NEW_LEAVES].sort());
    // e.g. Lait infantile keeps exactly what it had
    expect(links.some((l) => l.leafKey === 10503)).toBe(false);
    expect(generatedBlock(brandSql)).not.toContain(strictTypeId(10503));
    expect(generatedBlock(brandSql)).not.toContain(strictTypeId(10304));
  });

  it('25. the migration is registered in auto-apply.list after the leaves exist', () => {
    const list = read('auto-apply.list')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    expect(list).toContain(BRAND_LINKS);
    expect(list.indexOf(BRAND_LINKS)).toBeGreaterThan(list.indexOf(CATEGORY_MIGRATION));
  });
});

describe('a future migration cannot add a leaf without its brand links either', () => {
  /**
   * The brand twin of test 12. Every product-type leaf that a manual migration
   * inserts must also have the brand links `taxonomy-data.ts` declares for it
   * inserted by some manual migration — the catch-all « Autre » included.
   */
  const files = readdirSync(MANUAL_DIR).filter((f) => f.endsWith('.sql'));
  const allSql = files.map((f) => read(f));

  function idsInInsert(sql: string, table: string, prefix: string): string[] {
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

  /** Link pairs actually written, as `brandId|categoryId`. */
  function insertedLinkPairs(sql: string): string[] {
    const pairs: string[] = [];
    const re = /INSERT INTO "brand_categories"[\s\S]*?;/g;
    for (const stmt of sql.match(re) ?? []) {
      for (const m of stmt.matchAll(
        /\('(15000000-[0-9a-f-]+)',\s*'(16000000-[0-9a-f-]+)'\)/g,
      )) {
        pairs.push(`${m[1]}|${m[2]}`);
      }
    }
    return pairs;
  }

  const insertedLeafIds = new Set(
    allSql.flatMap((sql) => idsInInsert(sql, 'categories', '16000000')),
  );
  const insertedPairs = new Set(allSql.flatMap(insertedLinkPairs));

  it('26. every leaf inserted by a manual migration has its declared brand links inserted too', () => {
    expect(insertedLeafIds.size).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const leafId of insertedLeafIds) {
      const key = Number(leafId.split('-').pop());
      for (const link of brandLinksFor([key])) {
        if (!insertedPairs.has(`${link.brandId}|${link.categoryId}`)) {
          missing.push(`leaf ${key} — « ${link.brandName} » (${link.brandId})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

/**
 * Taxonomy id reuse (2026-09-11, P3 PR 1).
 *
 * The 2026-06-24 refactor reused category ids with NEW meanings while legacy
 * attributes and product specifications still referenced them. That is why a
 * whisky's « Type » points at an attribute now owned by « Lait & Produits
 * Laitiers »: id …010601 used to mean « Boissons ». The 2026-09-10 migration
 * repeated the pattern by upserting subcategory ids 106 and 107, inheriting
 * their legacy attribute rows.
 *
 * A canonical id must not silently acquire a different meaning.
 */
describe('a canonical taxonomy id keeps one meaning', () => {
  const files = readdirSync(MANUAL_DIR).filter((f) => f.endsWith('.sql'));

  /** Every (id, name) pair a manual migration writes into "categories". */
  function categoryNamesInMigrations(): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const file of files) {
      const sql = read(file);
      for (const stmt of sql.match(/INSERT INTO "categories"[\s\S]*?;/g) ?? []) {
        const body = stmt
          .split('\n')
          .filter((l) => !l.trimStart().startsWith('--'))
          .join('\n');
        // ('<uuid>', '<slug>', '<name>', …)
        for (const m of body.matchAll(
          /\('((?:13|16)000000-[0-9a-f-]+)',\s*'[^']*',\s*'((?:[^']|'')*)'/g,
        )) {
          const [, id, name] = m;
          map.set(id, (map.get(id) ?? new Set()).add(name.replace(/''/g, "'")));
        }
      }
    }
    return map;
  }

  it('27. no category id is written with two different names across manual migrations', () => {
    const conflicts: string[] = [];
    for (const [id, names] of categoryNamesInMigrations()) {
      if (names.size > 1) {
        conflicts.push(`${id} is written as ${[...names].map((n) => `« ${n} »`).join(' AND ')}`);
      }
    }
    expect(conflicts).toEqual([]);
  });

  it('28. the ids taxonomy-data.ts derives are internally unique', () => {
    // Two leaves sharing a numeric key, or two attributes colliding on
    // typeKey*100+slot, would silently overwrite each other at seed time.
    const leafKeys = allLeaves.map((l) => l.n);
    expect(new Set(leafKeys).size).toBe(leafKeys.length);

    const attrIds = allLeaves.flatMap((l) =>
      (l.attrs ?? []).map((_, slot) => attributeIdFor(l.n, slot)),
    );
    expect(new Set(attrIds).size).toBe(attrIds.length);

    const brandIds = STRICT_BRANDS.map((b) => strictBrandId(b.n));
    expect(new Set(brandIds).size).toBe(brandIds.length);
  });
});

/**
 * The one-off correction of the 18 foreign specification rows found in
 * production. Guards the SHAPE of the migration, not the taxonomy.
 */
describe('the foreign-specification correction migration', () => {
  const FOREIGN = '2026-09-11_foreign_product_specifications.sql';
  const sql = read(FOREIGN);
  const executable = sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

  it('29. touches only product_specifications', () => {
    expect(executable).not.toMatch(/"(products|orders|order_items|categories|brands|product_attributes)"/);
    expect(executable).toMatch(/"product_specifications"/);
  });

  it('30. every statement is keyed on an exact specification id AND its current attributeId', () => {
    // Without the attributeId guard a row already corrected by a seller — or by
    // a re-run — would be mutated a second time into the wrong state.
    const updates = executable.match(/UPDATE "product_specifications"[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(9);
    for (const u of updates) {
      expect(u).toMatch(/s\."id" = '[0-9a-f-]{36}'/);
      expect(u).toMatch(/s\."attributeId" = '14000000-[0-9a-f-]+'/);
      // and never lands on an attribute the product already holds
      expect(u).toMatch(/NOT EXISTS \(SELECT 1 FROM "product_specifications" x/);
    }

    const deletes = executable.match(/DELETE FROM "product_specifications"[\s\S]*?;/g) ?? [];
    expect(deletes).toHaveLength(1);
    const deleteStmt = deletes[0]!;
    // 3 (id, attributeId) pairs — never a category- or name-based predicate
    expect(deleteStmt.match(/\('[0-9a-f-]{36}', '14000000-[0-9a-f-]+'\)/g)).toHaveLength(3);
    expect(deleteStmt).not.toMatch(/categoryId|LIKE|IN \(SELECT/);
  });

  it('31. carries a rollback for every row it changes', () => {
    const rollback = sql.slice(sql.indexOf('-- ROLLBACK'));
    expect(rollback.match(/^-- UPDATE "product_specifications"/gm)).toHaveLength(9);
    expect(rollback.match(/^-- INSERT INTO "product_specifications"/gm)).toHaveLength(3);
  });

  it('32. is NOT auto-applied — a one-off data correction is reviewed, not replayed', () => {
    const list = read('auto-apply.list')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    expect(list).not.toContain(FOREIGN);
  });
});
