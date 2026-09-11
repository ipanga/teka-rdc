import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  P3_FOREIGN_SPECIFICATION_ALLOWLIST,
  findDuplicateBrandIdentities,
  findLeavesMissingCatchAll,
  normalizeBrandName,
  findCategoryIdentityConflicts,
  findForeignActiveSpecifications,
  findIntermediateAttributeViolations,
  findUnmaterialisedDeclarations,
  isLiveLeaf,
  buildLiveChildIndex,
  type CategoryNode,
} from './taxonomy-invariants';
import { STRICT_BRANDS, STRICT_CATEGORIES } from '../../../prisma/taxonomy-data';
import {
  attributeIdFor,
  brandLinksFor,
  renderBrandSql,
} from '../../../prisma/scripts/taxonomy-attribute-sql';

/**
 * Structural taxonomy invariants (2026-09-11, P2 PR A).
 *
 * Each invariant is tested BOTH ways: it must pass on healthy data AND fail on
 * a deliberately broken fixture. A guard that has never been shown to go red
 * is not a guard.
 *
 * The fixtures are generic on purpose — no test names ids 106/107, because the
 * audit proved the reuse was systemic (25 intermediate categories, 52
 * attributes). A guard built around the two ids I happened to touch would
 * protect nothing.
 */
const MANUAL_DIR = join(__dirname, '../../../prisma/migrations/manual');
const migrationSources = readdirSync(MANUAL_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => ({ file: f, sql: readFileSync(join(MANUAL_DIR, f), 'utf8') }));

const cat = (
  id: string,
  name: string,
  parentCategoryId: string | null = null,
  over: Partial<CategoryNode> = {},
): CategoryNode => ({ id, name, parentCategoryId, isActive: true, deletedAt: null, ...over });

// A minimal healthy tree: department → subcategory → leaf.
const DEPT = cat('c-dept', 'Mode');
const SUB = cat('c-sub', 'Homme', 'c-dept');
const LEAF = cat('c-leaf', 'Chemises', 'c-sub');
const TREE = [DEPT, SUB, LEAF];

describe('leaf detection mirrors the runtime', () => {
  it('a node with a live child is intermediate; a node without is a leaf', () => {
    const kids = buildLiveChildIndex(TREE);
    expect(isLiveLeaf(DEPT, kids)).toBe(false);
    expect(isLiveLeaf(SUB, kids)).toBe(false);
    expect(isLiveLeaf(LEAF, kids)).toBe(true);
  });

  it('a node whose only child is soft-deleted counts as a leaf', () => {
    const tree = [DEPT, SUB, cat('c-leaf', 'Chemises', 'c-sub', { deletedAt: new Date() })];
    expect(isLiveLeaf(SUB, buildLiveChildIndex(tree))).toBe(true);
  });
});

describe('INVARIANT 1 — characteristics belong to live leaves', () => {
  it('passes when every attribute sits on a leaf', () => {
    expect(
      findIntermediateAttributeViolations(TREE, [
        { id: 'a1', categoryId: 'c-leaf', name: 'Taille' },
      ]),
    ).toEqual([]);
  });

  it('FAILS when an attribute sits on a live intermediate node', () => {
    // The « Type de peau » on Mode > Homme shape, in the abstract.
    const found = findIntermediateAttributeViolations(TREE, [
      { id: 'a1', categoryId: 'c-sub', name: 'Type de peau' },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ categoryId: 'c-sub', attributeName: 'Type de peau' });
  });

  it('an explicit allowlist entry excuses exactly that category and nothing else', () => {
    const attrs = [
      { id: 'a1', categoryId: 'c-sub', name: 'Type de peau' },
      { id: 'a2', categoryId: 'c-dept', name: 'Pointure' },
    ];
    const found = findIntermediateAttributeViolations(TREE, attrs, new Set(['c-sub']));
    expect(found.map((v) => v.categoryId)).toEqual(['c-dept']);
  });

  it('ignores attributes on inactive or soft-deleted categories — those are history, not breakage', () => {
    const tree = [DEPT, cat('c-sub', 'Homme', 'c-dept', { isActive: false }), LEAF];
    expect(
      findIntermediateAttributeViolations(tree, [{ id: 'a1', categoryId: 'c-sub', name: 'X' }]),
    ).toEqual([]);
  });

  it('the canonical source never declares a characteristic outside a leaf', () => {
    // taxonomy-data.ts can only attach AttrTpl through ProductTypeDef.attrs,
    // so this is structurally true — pinned so a future shape change is caught.
    for (const dept of STRICT_CATEGORIES) {
      expect(dept).not.toHaveProperty('attrs');
      for (const sub of dept.subs) expect(sub).not.toHaveProperty('attrs');
    }
  });
});

describe('INVARIANT 2 — no foreign characteristic on an ACTIVE product', () => {
  const products = [
    { id: 'p1', shortCode: 'aaa111', categoryId: 'c-leaf', status: 'ACTIVE', deletedAt: null },
    { id: 'p2', shortCode: 'bbb222', categoryId: 'c-leaf', status: 'ARCHIVED', deletedAt: null },
    { id: 'p3', shortCode: 'ccc333', categoryId: 'c-leaf', status: 'ACTIVE', deletedAt: new Date() },
  ];
  const attributes = [
    { id: 'a-own', categoryId: 'c-leaf', name: 'Taille' },
    { id: 'a-foreign', categoryId: 'c-other', name: 'Type' },
  ];

  it('passes when the specification belongs to the product category', () => {
    expect(
      findForeignActiveSpecifications(products, attributes, [
        { id: 's1', productId: 'p1', attributeId: 'a-own' },
      ]),
    ).toEqual([]);
  });

  it('FAILS on a foreign specification attached to an ACTIVE product', () => {
    const found = findForeignActiveSpecifications(products, attributes, [
      { id: 's1', productId: 'p1', attributeId: 'a-foreign' },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ specificationId: 's1', shortCode: 'aaa111' });
  });

  it('ignores ARCHIVED and soft-deleted products — they are not buyer-reachable', () => {
    expect(
      findForeignActiveSpecifications(products, attributes, [
        { id: 's2', productId: 'p2', attributeId: 'a-foreign' },
        { id: 's3', productId: 'p3', attributeId: 'a-foreign' },
      ]),
    ).toEqual([]);
  });

  it('the allowlist is keyed by SPECIFICATION id, so it cannot excuse an unknown row', () => {
    const found = findForeignActiveSpecifications(
      products,
      attributes,
      [
        { id: 's-known', productId: 'p1', attributeId: 'a-foreign' },
        { id: 's-new', productId: 'p1', attributeId: 'a-foreign' },
      ],
      new Set(['s-known']),
    );
    expect(found.map((v) => v.specificationId)).toEqual(['s-new']);
  });

  it('the P3 allowlist is minimal and documented — 6 known residual rows', () => {
    // Must only ever SHRINK. The six characteristics with no canonical home.
    // The three shirt duplicates left on 2026-09-11 when P3-2 removed them.
    expect(P3_FOREIGN_SPECIFICATION_ALLOWLIST.size).toBe(6);
  });
});

describe('INVARIANT 3 — one category id, one identity', () => {
  it('passes on the real migration history', () => {
    expect(findCategoryIdentityConflicts(migrationSources)).toEqual([]);
  });

  it('FAILS when two migrations write the same id under different names', () => {
    const conflicts = findCategoryIdentityConflicts([
      {
        file: 'a.sql',
        sql: `INSERT INTO "categories" ("id","slug","name") VALUES ('13000000-0000-0000-0000-000000000106', 'boissons', 'Boissons');`,
      },
      {
        file: 'b.sql',
        sql: `INSERT INTO "categories" ("id","slug","name") VALUES ('13000000-0000-0000-0000-000000000106', 'lait', 'Lait & Produits Laitiers');`,
      },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].names.sort()).toEqual(['Boissons', 'Lait & Produits Laitiers']);
    expect(conflicts[0].files.sort()).toEqual(['a.sql', 'b.sql']);
  });

  it('a comment naming a different identity does not trigger a false positive', () => {
    // Comments are stripped: the 2026-08 TestFlight guard learned that a
    // comment mentioning a value can otherwise satisfy — or here, break — a test.
    expect(
      findCategoryIdentityConflicts([
        {
          file: 'a.sql',
          sql: `-- was 'Boissons' before the refactor\nINSERT INTO "categories" ("id","slug","name") VALUES ('13000000-0000-0000-0000-000000000106', 'lait', 'Lait');`,
        },
      ]),
    ).toEqual([]);
  });
});

describe('INVARIANT 4 — a migration that creates a leaf materialises its declarations', () => {
  const declaredFor = (leafKey: number) => {
    const leaf = STRICT_CATEGORIES.flatMap((c) => c.subs.flatMap((s) => s.types)).find(
      (t) => t.n === leafKey,
    );
    return {
      attributeIds: (leaf?.attrs ?? []).map((_, slot) => attributeIdFor(leafKey, slot)),
      brandLinks: brandLinksFor([leafKey]).map((l) => ({ brandId: l.brandId, categoryId: l.categoryId })),
    };
  };

  it('passes on the real migration history', () => {
    expect(findUnmaterialisedDeclarations(migrationSources, declaredFor)).toEqual([]);
  });

  it('FAILS when a migration creates a leaf without its characteristics or brand links', () => {
    const missing = findUnmaterialisedDeclarations(
      [
        {
          file: 'new.sql',
          sql: `INSERT INTO "categories" ("id","slug","name") VALUES ('16000000-0000-0000-0000-000000010703', 'spiritueux', 'Spiritueux');`,
        },
      ],
      declaredFor,
    );
    expect(missing).toHaveLength(1);
    expect(missing[0].leafKey).toBe(10703);
    // both kinds of omission are reported, not just the first
    expect(missing[0].missing.some((m) => m.startsWith('attribute'))).toBe(true);
    expect(missing[0].missing.some((m) => m.startsWith('brand link'))).toBe(true);
  });
});

/**
 * The P2 PR B migration that retires the 46 latent legacy characteristics.
 * Guards its SHAPE — the taxonomy invariants above guard the outcome.
 */
describe('the legacy-characteristic retirement migration', () => {
  const FILE = '2026-09-11_retire_legacy_intermediate_attributes.sql';
  const raw = readFileSync(join(MANUAL_DIR, FILE), 'utf8');
  const executable = raw
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
  const HOLDING = '13000000-0000-0000-0000-000000000999';

  it('moves exactly 46 characteristics and creates exactly 1 holding category', () => {
    expect(executable.match(/^UPDATE "product_attributes"/gm)).toHaveLength(46);
    expect(executable.match(/^INSERT INTO "categories"/gm)).toHaveLength(1);
  });

  it('deletes nothing — historical references must survive', () => {
    // 172 specifications on soft-deleted products point at these rows.
    expect(executable).not.toMatch(/\bDELETE\b/i);
    expect(executable).not.toMatch(/\bDROP\b|\bTRUNCATE\b/i);
  });

  it('touches only categories and product_attributes', () => {
    expect(sorted(executable.match(/(?:UPDATE|INSERT INTO) "(\w+)"/g) ?? [])).toEqual([
      'INSERT INTO "categories"',
      'UPDATE "product_attributes"',
    ]);
    for (const t of ['products', 'orders', 'order_items', 'product_specifications', 'brands', 'brand_categories']) {
      expect(executable).not.toContain(`"${t}"`);
    }
  });

  it('every UPDATE is guarded on the attribute id AND its current category', () => {
    // Without the categoryId guard, a row already moved would be moved again
    // from wherever it now lives.
    const updates = executable.match(/UPDATE "product_attributes"[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(46);
    for (const u of updates) {
      expect(u).toMatch(/WHERE "id" = '[0-9a-f-]{36}'/);
      expect(u).toMatch(/AND "categoryId" = '13000000-[0-9a-f-]+'/);
      expect(u).toContain(`SET "categoryId" = '${HOLDING}'`);
    }
  });

  it('the holding category is created inactive and soft-deleted, so it can never be a live node', () => {
    const insert = executable.match(/INSERT INTO "categories"[\s\S]*?;/)![0];
    expect(insert).toContain(HOLDING);
    expect(insert).toMatch(/FALSE, NOW\(\)/); // isActive = FALSE, deletedAt = NOW()
    expect(insert).toMatch(/ON CONFLICT \("id"\) DO NOTHING;/);
    // no slug and no parent, so it is outside the tree entirely:
    //   ('<id>', NULL, '<name>', NULL, <sortOrder>, FALSE, NOW(), …)
    expect(insert).toMatch(
      /VALUES \('13000000-[0-9a-f-]+',\s*NULL,\s*'[^']*',\s*NULL,\s*\d+,\s*FALSE,\s*NOW\(\)/,
    );
  });

  it('leaves the 6 ACTIVE-dependent characteristics alone', () => {
    // They are P3 taxonomy-gap decisions: a value with no canonical home cannot
    // be rehomed by a data migration.
    const moved = [...executable.matchAll(/WHERE "id" = '([0-9a-f-]{36})'/g)].map((m) => m[1]);
    expect(new Set(moved).size).toBe(46);
  });

  it('carries a rollback restoring every moved row', () => {
    const rollback = raw.slice(raw.indexOf('-- ROLLBACK'));
    expect(rollback.match(/^-- UPDATE "product_attributes"/gm)).toHaveLength(46);
    // and only removes the holder once nothing references it
    expect(rollback).toMatch(/NOT EXISTS \(SELECT 1 FROM "product_attributes"/);
  });

  it('is NOT auto-applied — a taxonomy data correction is reviewed, not replayed on deploy', () => {
    const list = readFileSync(join(MANUAL_DIR, 'auto-apply.list'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    expect(list).not.toContain(FILE);
  });
});

function sorted(a: string[]): string[] {
  return [...new Set(a)].sort();
}

/**
 * Brand identity + catch-all (2026-09-11, P2 PR C).
 *
 * 80 of 150 live leaves offered only « Autre ». Filling that gap means adding
 * brand rows, which is exactly when duplicate spellings creep in — « Nestle »
 * beside « Nestlé » splits a dropdown without ever looking wrong in a list, and
 * the database's unique constraints are exact-match only.
 */
const brand = (name: string, slug: string, over: Partial<{ isActive: boolean; deletedAt: Date | null }> = {}) => ({
  id: `b-${slug}`, name, slug, isActive: true, deletedAt: null, ...over,
});

describe('INVARIANT 5 — one brand, one identity', () => {
  it('passes on distinct brands', () => {
    expect(findDuplicateBrandIdentities([brand('Tembo', 'tembo'), brand('Simba', 'simba')])).toEqual([]);
  });

  it('FAILS on an accent variant', () => {
    const dup = findDuplicateBrandIdentities([brand('Nestlé', 'nestle-1'), brand('Nestle', 'nestle-2')]);
    expect(dup).toHaveLength(1);
    expect(dup[0]).toMatchObject({ kind: 'name' });
  });

  it('FAILS on a case or whitespace variant', () => {
    expect(findDuplicateBrandIdentities([brand('World Cola', 'wc1'), brand('world  cola', 'wc2')])).toHaveLength(1);
  });

  it('FAILS on a slug collision even when the names differ', () => {
    const dup = findDuplicateBrandIdentities([brand('Coca-Cola', 'coca-cola'), brand('Coca Cola', 'coca-cola')]);
    expect(dup.some((d) => d.kind === 'slug')).toBe(true);
  });

  it('ignores retired rows — the __old__ placeholders are parked, not duplicates', () => {
    expect(
      findDuplicateBrandIdentities([
        brand('Tembo', 'tembo'),
        brand('Tembo', 'tembo-old', { isActive: false, deletedAt: new Date() }),
      ]),
    ).toEqual([]);
  });

  it('the canonical source declares no duplicate brand identity', () => {
    const rows = STRICT_BRANDS.map((b) => brand(b.fr, String(b.n)));
    expect(findDuplicateBrandIdentities(rows)).toEqual([]);
  });

  it('normalisation is accent-, case- and whitespace-insensitive', () => {
    expect(normalizeBrandName('  MÜTZIG ')).toBe('mutzig');
    expect(normalizeBrandName("D'jino")).toBe("d'jino");
  });
});

describe('INVARIANT 6 — every live leaf keeps « Autre »', () => {
  const AUTRE = brand('Autre', 'autre');

  it('passes when the catch-all reaches every leaf', () => {
    expect(
      findLeavesMissingCatchAll(TREE, [AUTRE], [{ brandId: AUTRE.id, categoryId: 'c-leaf' }]),
    ).toEqual([]);
  });

  it('FAILS when a leaf has no catch-all', () => {
    const missing = findLeavesMissingCatchAll(TREE, [AUTRE], []);
    expect(missing).toHaveLength(1);
    expect(missing[0].categoryId).toBe('c-leaf');
  });

  it('intermediate nodes are not expected to carry it', () => {
    const missing = findLeavesMissingCatchAll(TREE, [AUTRE], [{ brandId: AUTRE.id, categoryId: 'c-leaf' }]);
    expect(missing.map((m) => m.categoryId)).not.toContain('c-sub');
  });
});

describe('the DRC beverage brand migration', () => {
  const FILE = '2026-09-11_drc_beverage_brands.sql';
  const raw = readFileSync(join(MANUAL_DIR, FILE), 'utf8');
  const executable = raw.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  const NEW_IDS = Array.from({ length: 15 }, (_, i) => 56 + i);
  /** Pinned to the brands this migration was about — see renderBrandSql. */
  const LINK_IDS = [1, 52, 53, 55, ...NEW_IDS];

  it('matches a fresh render of taxonomy-data.ts', () => {
    const block = raw.match(/-- GENERATED BLOCK BEGIN[^\n]*\n([\s\S]*?)\n-- GENERATED BLOCK END/)![1].trim();
    expect(block).toBe(renderBrandSql([10201, 10203, 10701], NEW_IDS, LINK_IDS).trim());
  });

  it('is purely additive — DO NOTHING, never DO UPDATE, and no destructive verb', () => {
    // An existing brand must keep its live name, logo and sortOrder.
    expect(executable).not.toMatch(/DO UPDATE/);
    expect(executable.match(/DO NOTHING/g)).toHaveLength(2);
    expect(executable).not.toMatch(/\b(DELETE|UPDATE|DROP|TRUNCATE|ALTER)\b/i);
  });

  it('touches only brands and brand_categories — never a product or an order', () => {
    expect(sorted(executable.match(/INSERT INTO "(\w+)"/g) ?? [])).toEqual([
      'INSERT INTO "brand_categories"',
      'INSERT INTO "brands"',
    ]);
    for (const t of ['products', 'orders', 'order_items', 'product_specifications', 'categories', 'product_attributes']) {
      expect(executable).not.toContain(`INSERT INTO "${t}"`);
    }
    // and it never assigns a brand to an existing product
    expect(executable).not.toMatch(/"brandId"\s*=/);
  });

  it('creates exactly 15 brands, all on free ids, never reusing the retired slots', () => {
    const rows = executable.match(/INSERT INTO "brands"[\s\S]*?;/)![0];
    const ids = [...rows.matchAll(/'15000000-0000-0000-0000-(\d{12})'/g)].map((m) => Number(m[1]));
    expect(ids).toHaveLength(15);
    expect(ids).toEqual(NEW_IDS);
    expect(ids).not.toContain(50); // the retired Castrol slot
    expect(ids).not.toContain(51);
  });

  it('only the three evidenced leaves are linked', () => {
    const links = executable.match(/INSERT INTO "brand_categories"[\s\S]*?;/)![0];
    const leaves = new Set(
      [...links.matchAll(/'16000000-0000-0000-0000-(\d{12})'/g)].map((m) => Number(m[1])),
    );
    expect([...leaves].sort()).toEqual([10201, 10203, 10701]);
  });

  it('« Autre » is re-linked on all three, so the catch-all can never be dropped', () => {
    const links = executable.match(/INSERT INTO "brand_categories"[\s\S]*?;/)![0];
    for (const leaf of ['010201', '010203', '010701']) {
      expect(links).toContain(`('15000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000${leaf}')`);
    }
  });

  it('the source maps each new brand to a beverage leaf it has evidence for', () => {
    const byName = new Map(STRICT_BRANDS.map((b) => [b.fr, b.types]));
    expect(byName.get('Tembo')).toEqual([10701]);
    expect(byName.get('Cristal')).toEqual([10201]);
    expect(byName.get("D'jino")).toEqual([10203]);
    // and none of them leaks into an unrelated leaf
    for (const n of NEW_IDS) {
      const b = STRICT_BRANDS.find((x) => x.n === n)!;
      expect(b.types.every((t) => [10201, 10203, 10701].includes(t))).toBe(true);
    }
  });

  it('is NOT auto-applied — a catalogue change is reviewed, not replayed on deploy', () => {
    const list = readFileSync(join(MANUAL_DIR, 'auto-apply.list'), 'utf8')
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(list).not.toContain(FILE);
  });
});

/**
 * P3-2 — removing three duplicate characteristics from one product.
 * Guards the SHAPE of the migration; the taxonomy invariants guard the outcome.
 */
describe('the duplicate-specification removal migration', () => {
  const FILE = '2026-09-11_remove_duplicate_shirt_specifications.sql';
  const raw = readFileSync(join(MANUAL_DIR, FILE), 'utf8');
  const executable = raw.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  it('removes exactly three rows and nothing else', () => {
    const deletes = executable.match(/DELETE FROM "product_specifications"[\s\S]*?;/g) ?? [];
    expect(deletes).toHaveLength(3);
    expect(executable.match(/;/g)).toHaveLength(3);
  });

  it('touches only product_specifications', () => {
    expect(sorted(executable.match(/(?:DELETE FROM|INSERT INTO|UPDATE) "(\w+)"/g) ?? [])).toEqual([
      'DELETE FROM "product_specifications"',
    ]);
    for (const t of ['products', 'categories', 'brands', 'brand_categories', 'orders', 'order_items', 'product_attributes']) {
      expect(executable).not.toContain(`"${t}"`);
    }
  });

  it('every DELETE is keyed on id AND productId AND attributeId AND value', () => {
    // Four keys, so a row edited, repointed or already removed cannot match.
    for (const d of executable.match(/DELETE FROM "product_specifications"[\s\S]*?;/g) ?? []) {
      expect(d).toMatch(/d\."id"\s+= '[0-9a-f-]{36}'/);
      expect(d).toMatch(/d\."productId"\s+= '[0-9a-f-]{36}'/);
      expect(d).toMatch(/d\."attributeId" = '14000000-[0-9a-f-]+'/);
      expect(d).toMatch(/d\."value"\s+= '[^']+'/);
    }
  });

  it('refuses unless the canonical replacement is still present with the identical value', () => {
    // The heart of it: a duplicate may only go if nothing is lost by its going.
    const deletes = executable.match(/DELETE FROM "product_specifications"[\s\S]*?;/g) ?? [];
    expect(deletes).toHaveLength(3);
    for (const d of deletes) {
      expect(d).toMatch(/AND EXISTS \(/);
      expect(d).toMatch(/k\."id"\s+= '[0-9a-f-]{36}'/);
      expect(d).toMatch(/k\."attributeId" = '14000000-[0-9a-f-]+'/);
      expect(d).toMatch(/k\."value"\s+= d\."value"/);
      expect(d).toMatch(/k\."productId"\s+= d\."productId"/);
    }
  });

  it('does NOT delete the legacy attribute rows — other history still references them', () => {
    expect(executable).not.toMatch(/DELETE FROM "product_attributes"/);
  });

  it('leaves the three unresolved Group B characteristics alone', () => {
    // oil « Type », « Mémoire interne », iron « Type » — real seller data with
    // no canonical home, reserved for P3-4.
    for (const attr of [
      '14000000-0000-0000-0000-000000010202',
      '14000000-0000-0000-0000-000000020102',
      '14000000-0000-0000-0000-000000030501',
    ]) {
      expect(executable).not.toContain(attr);
    }
  });

  it('carries a rollback restoring all three rows with their original ids', () => {
    const rollback = raw.slice(raw.indexOf('-- ROLLBACK'));
    expect(rollback.match(/^-- INSERT INTO "product_specifications"/gm)).toHaveLength(3);
    expect(rollback).toMatch(/ON CONFLICT DO NOTHING/);
  });

  it('is NOT auto-applied', () => {
    const list = readFileSync(join(MANUAL_DIR, 'auto-apply.list'), 'utf8')
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(list).not.toContain(FILE);
  });

  it('the P3 allowlist now holds 6 — the three shirt duplicates are gone from production', () => {
    expect(P3_FOREIGN_SPECIFICATION_ALLOWLIST.size).toBe(6);
  });
});
