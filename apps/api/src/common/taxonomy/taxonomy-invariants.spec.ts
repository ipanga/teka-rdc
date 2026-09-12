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
  allLeafKeys,
  attributeIdFor,
  attributeRowsFor,
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

  it('the P3 allowlist is minimal and documented — 3 known residual rows', () => {
    // Must only ever SHRINK. 9 → 6 (P3-2 shirt duplicates), 6 → 5 (P3-4a Galaxy
    // A14 storage), 5 → 4 (P3-4c iron « Type »), 4 → 3 (P3-4d oil « Type »).
    // Each row stopped being foreign rather than being excused.
    expect(P3_FOREIGN_SPECIFICATION_ALLOWLIST.size).toBe(3);
    expect(P3_FOREIGN_SPECIFICATION_ALLOWLIST.has('7476a834-8ca6-423d-94b6-f1e9e6bc3f4b')).toBe(false);
  });
});

/**
 * Post-P3 maintenance — the allowlist after P3-4d.
 *
 * These tests exist to stop two opposite mistakes: leaving a dead permit behind
 * (which would silently excuse the row if it ever turned foreign again), and
 * over-trimming the list (which would hide a genuine violation). Every id below
 * is the real production id, so the fixtures describe the rows they name.
 */
describe('the P3 allowlist after P3-4d — dead permits out, live ones kept', () => {
  const OIL_SPEC = '5bf39dfd-925b-461e-8a4c-07028a2a183d';
  const LOAD_BEARING = [
    { spec: 'ab2bf530-4a3c-46a0-ab51-7eb0abea834f', product: 'rt7ibz', value: 'Lait en poudre' },
    { spec: '1f771953-aeb0-4e66-9b10-ce61df4c491b', product: 'vnkqce', value: 'Savon de lessive' },
    { spec: 'f71a9667-5233-4eef-a1a3-b468b32ac70e', product: 'd3k7ei', value: 'Blender' },
  ];

  it('no longer excuses the P3-4d oil specification', () => {
    expect(P3_FOREIGN_SPECIFICATION_ALLOWLIST.has(OIL_SPEC)).toBe(false);
  });

  it('holds exactly the three load-bearing residuals and nothing else', () => {
    expect([...P3_FOREIGN_SPECIFICATION_ALLOWLIST].sort()).toEqual(
      LOAD_BEARING.map((r) => r.spec).sort(),
    );
  });

  // The reason the oil entry could go: the row is no longer foreign at all, so
  // the invariant returns before it ever reaches the allowlist. Proven with an
  // EMPTY allowlist — nothing is excusing it.
  it('the post-P3-4d oil row raises no violation even with an EMPTY allowlist', () => {
    const HUILES = '16000000-0000-0000-0000-000000010107';
    const oilProducts = [
      { id: 'p-oil', shortCode: 'pocc99', categoryId: HUILES, status: 'ACTIVE', deletedAt: null },
    ];
    const oilAttributes = [
      { id: '14000000-0000-0000-0000-000001010703', categoryId: HUILES, name: 'Type' },
    ];
    const oilSpecs = [
      { id: OIL_SPEC, productId: 'p-oil', attributeId: '14000000-0000-0000-0000-000001010703' },
    ];
    expect(findForeignActiveSpecifications(oilProducts, oilAttributes, oilSpecs, new Set())).toEqual([]);
  });

  // The mirror image: had P3-4d NOT run, the same row would be reported. This is
  // what proves the removal restores detection rather than hiding it.
  it('the SAME row, still on its pre-P3-4d foreign owner, IS reported', () => {
    const HUILES = '16000000-0000-0000-0000-000000010107';
    const BOISSONS = '13000000-0000-0000-0000-000000000102';
    const found = findForeignActiveSpecifications(
      [{ id: 'p-oil', shortCode: 'pocc99', categoryId: HUILES, status: 'ACTIVE', deletedAt: null }],
      [{ id: '14000000-0000-0000-0000-000000010202', categoryId: BOISSONS, name: 'Type' }],
      [{ id: OIL_SPEC, productId: 'p-oil', attributeId: '14000000-0000-0000-0000-000000010202' }],
      P3_FOREIGN_SPECIFICATION_ALLOWLIST,
    );
    expect(found.map((v) => v.specificationId)).toEqual([OIL_SPEC]);
  });

  describe('each remaining entry is individually load-bearing', () => {
    // All three rows ARE genuinely foreign: their attribute sits on a retired
    // category, their product does not. Modelled exactly that way.
    const products = LOAD_BEARING.map((r) => ({
      id: `p-${r.product}`, shortCode: r.product, categoryId: `leaf-${r.product}`,
      status: 'ACTIVE', deletedAt: null,
    }));
    const attributes = LOAD_BEARING.map((r) => ({
      id: `attr-${r.product}`, categoryId: 'retired-owner', name: 'Type',
    }));
    const specifications = LOAD_BEARING.map((r) => ({
      id: r.spec, productId: `p-${r.product}`, attributeId: `attr-${r.product}`,
    }));

    it('the full allowlist excuses all three — 0 violations', () => {
      expect(
        findForeignActiveSpecifications(products, attributes, specifications, P3_FOREIGN_SPECIFICATION_ALLOWLIST),
      ).toEqual([]);
    });

    it.each(LOAD_BEARING)('removing $product ($value) surfaces exactly that row', ({ spec }) => {
      const trimmed = new Set([...P3_FOREIGN_SPECIFICATION_ALLOWLIST].filter((id) => id !== spec));
      expect(trimmed.size).toBe(2);
      const found = findForeignActiveSpecifications(products, attributes, specifications, trimmed);
      expect(found.map((v) => v.specificationId)).toEqual([spec]);
    });

    it('an empty allowlist surfaces all three — none is excused by accident', () => {
      const found = findForeignActiveSpecifications(products, attributes, specifications, new Set());
      expect(found.map((v) => v.specificationId).sort()).toEqual(LOAD_BEARING.map((r) => r.spec).sort());
    });
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

  it('the P3 allowlist now holds 3 — shirt duplicates gone (P3-2), Galaxy A14 canonicalised (P3-4a)', () => {
    expect(P3_FOREIGN_SPECIFICATION_ALLOWLIST.size).toBe(3);
    // foyug0's storage row is no longer foreign: it points at its own leaf.
    expect(P3_FOREIGN_SPECIFICATION_ALLOWLIST.has('600d7c1c-c1cd-4c8d-ba15-e6502620fc4e')).toBe(false);
  });
});

/**
 * P3-4a — canonicalising the Galaxy A14 storage characteristic.
 *
 * « Mémoire interne » is a differently-named duplicate of the canonical
 * « Stockage » that taxonomy-data.ts declares for every smartphone leaf, left
 * stranded on the INTERMEDIATE « Smartphones » node by the 2026-06-24 id reuse.
 * A production read on 2026-09-11 proved the consequence: the buyer PDP shows
 * « Mémoire interne : 16Go » while the seller form offers an EMPTY « Stockage »
 * and never the row the buyer can see.
 *
 * These tests guard the SHAPE of the migration. The taxonomy invariants above
 * guard the outcome.
 */
describe('the Galaxy A14 storage canonicalisation migration', () => {
  const FILE = '2026-09-11_canonicalise_galaxy_a14_storage.sql';
  const raw = readFileSync(join(MANUAL_DIR, FILE), 'utf8');
  const executable = raw.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  const SPEC = '600d7c1c-c1cd-4c8d-ba15-e6502620fc4e';
  const OLD_ATTR = '14000000-0000-0000-0000-000000020102'; // « Mémoire interne »
  const HOLDING = '13000000-0000-0000-0000-000000000999';
  const ANDROID_LEAF_KEY = 20101;

  it('targets the canonical « Stockage » id the SOURCE declares, not a hand-picked one', () => {
    // Derived from taxonomy-data.ts through the same generator the shipped
    // migrations use, so a change to the declaration breaks this test rather
    // than silently leaving the migration pointing at the wrong row.
    const android = attributeRowsFor([ANDROID_LEAF_KEY]);
    const stockage = android.find((a) => a.name === 'Stockage');
    expect(stockage).toBeDefined();
    expect(executable).toContain(stockage!.id);
  });

  it('the destination accepts the exact value being preserved', () => {
    const stockage = attributeRowsFor([ANDROID_LEAF_KEY]).find((a) => a.name === 'Stockage');
    expect(stockage!.options).toContain('16Go');
  });

  it('DELETES NOTHING — no seller value and no historical row may be destroyed', () => {
    expect(executable).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executable).not.toMatch(/\bTRUNCATE\b/i);
    expect(executable).not.toMatch(/\bDROP\b/i);
  });

  it('touches only product_specifications and product_attributes', () => {
    const writes = new Set(
      (executable.match(/(?:INSERT INTO|UPDATE)\s+"(\w+)"/g) ?? []).map((m) => m.replace(/.*"(\w+)"/, '$1')),
    );
    expect([...writes].sort()).toEqual(['product_attributes', 'product_specifications']);
    for (const t of ['products', 'categories', 'brands', 'brand_categories', 'orders', 'order_items', 'users']) {
      expect(executable).not.toMatch(new RegExp(`(?:INSERT INTO|UPDATE|DELETE FROM)\\s+"${t}"`));
    }
  });

  it('repoints exactly ONE specification, keyed on id AND productId AND attributeId AND value', () => {
    const updates = executable.match(/UPDATE "product_specifications"[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(1);
    const u = updates[0]!;
    const where = u.slice(u.indexOf('WHERE'));
    expect(where).toMatch(/"id" = v_spec/);
    expect(where).toMatch(/"productId" = v_product/);
    expect(where).toMatch(/"attributeId" = v_old_attr/);
    expect(where).toMatch(/"value" = v_value/);

    // The row keeps its identity: the SET clause may change the owner and the
    // timestamp, and nothing else — the seller's value is never rewritten.
    const set = u.slice(u.indexOf('SET'), u.indexOf('WHERE'));
    expect(set.match(/"(\w+)"\s*=/g)?.sort()).toEqual(['"attributeId" =', '"updatedAt" =']);
  });

  it('retires exactly ONE attribute, keyed on id AND its current category', () => {
    const updates = executable.match(/UPDATE "product_attributes"[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatch(/"id" = v_old_attr/);
    expect(updates[0]).toMatch(/"categoryId" = v_old_home/);
    expect(updates[0]).toMatch(/SET\s+"categoryId" = v_holding/);
  });

  it('re-homes onto the EXISTING holding category and does not invent another', () => {
    expect(executable).toContain(HOLDING);
    expect(executable).not.toMatch(/INSERT INTO "categories"/);
  });

  it('never matches on an attribute NAME — the target cannot silently broaden', () => {
    // No predicate anywhere compares a name column.
    expect(executable).not.toMatch(/"name"\s*(?:=|LIKE|ILIKE|~)/i);

    // The label does appear — but only inside operator-facing RAISE messages.
    // TRAILING `--` comments are stripped as well: a label sitting in a comment
    // beside a declaration is documentation, not a predicate, and counting it
    // would be the same comment-trap this suite has been bitten by before.
    const codeOnly = executable
      .split('\n')
      .map((l) => l.replace(/\s--\s.*$/, ''))
      .join('\n');
    for (const line of codeOnly.split('\n')) {
      if (!line.includes('Mémoire interne')) continue;
      expect(line).toMatch(/RAISE (?:EXCEPTION|NOTICE)/);
    }
  });

  it('the pre-state check is itself keyed on all four columns', () => {
    // A precondition that only checked the id would happily approve a row whose
    // value or owner had changed, and the refusal would never fire.
    const check = executable.slice(
      executable.indexOf('INTO v_points_old'),
      executable.indexOf('INTO v_points_new'),
    );
    expect(check).toMatch(/"id" = v_spec/);
    expect(check).toMatch(/"productId" = v_product/);
    expect(check).toMatch(/"attributeId" = v_old_attr/);
    expect(check).toMatch(/"value" = v_value/);
  });

  it('is refusal-first: every drift condition raises instead of writing', () => {
    // drifted value / wrong home / collision / missing destination
    const raises = executable.match(/RAISE EXCEPTION 'P3-4a REFUSED/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(4);
    expect(executable).toMatch(/v_collision <> 0/);
    expect(executable).toMatch(/v_points_old <> 1/);
    expect(executable).toMatch(/v_attr_home <> v_old_home/);
  });

  it('is idempotent: an already-applied state is a NOTICE, never an error', () => {
    expect(executable).toMatch(/v_points_new = 1 AND v_attr_home = v_holding/);
    expect(executable).toMatch(/RAISE NOTICE 'P3-4a already applied/);
    expect(executable).toMatch(/RETURN;/);
  });

  it('verifies its own end state and aborts the whole block if it is wrong', () => {
    const aborts = executable.match(/RAISE EXCEPTION 'P3-4a ABORTED/g) ?? [];
    expect(aborts.length).toBeGreaterThanOrEqual(4);
    // the four historical rows must survive
    expect(executable).toMatch(/WHERE "attributeId" = v_old_attr\) <> 4/);
  });

  it('runs as ONE atomic block, so a refusal part-way writes nothing', () => {
    expect(executable.match(/DO \$\$/g)).toHaveLength(1);
    expect(executable).toMatch(/END \$\$;/);
  });

  it('leaves the other two Group B characteristics for their own sub-phases', () => {
    for (const attr of [
      '14000000-0000-0000-0000-000000010202', // oil « Type »   → P3-4d
      '14000000-0000-0000-0000-000000030501', // iron « Type »  → P3-4c
      '14000000-0000-0000-0000-000000040101', // Cuisine Taille → P3-4b
      '14000000-0000-0000-0000-000000040102', // Cuisine Couleur
      '14000000-0000-0000-0000-000000040103', // Cuisine Matière
    ]) {
      expect(executable).not.toContain(attr);
    }
  });

  it('carries a rollback restoring BOTH rows exactly', () => {
    const rollback = raw.slice(raw.indexOf('-- ── ROLLBACK'));
    expect(rollback).toContain(SPEC);
    expect(rollback).toContain(OLD_ATTR);
    expect(rollback).toMatch(/-- UPDATE "product_specifications"/);
    expect(rollback).toMatch(/-- UPDATE "product_attributes"/);
    // restores the ORIGINAL owners
    expect(rollback).toContain('13000000-0000-0000-0000-000000000201');
  });

  it('is NOT auto-applied — a data change is reviewed, not replayed on deploy', () => {
    const list = readFileSync(join(MANUAL_DIR, 'auto-apply.list'), 'utf8')
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(list).not.toContain(FILE);
  });
});

/**
 * P3-4b — retiring the three legacy « Cuisine » characteristics.
 *
 * « Taille », « Couleur » and « Matière » are clothing characteristics stranded
 * on « Électroménager > Cuisine » by the 2026-06-24 id reuse. P3-2 removed their
 * last live references, so they now satisfy exactly the condition P2 PR B used
 * to retire 46 others: every remaining specification sits on a SOFT-DELETED
 * product.
 *
 * The migration MOVES the attribute rows and writes no specification at all.
 */
describe('the Cuisine legacy-characteristic retirement migration', () => {
  const FILE = '2026-09-11_retire_cuisine_legacy_attributes.sql';
  const raw = readFileSync(join(MANUAL_DIR, FILE), 'utf8');
  const executable = raw.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  const CUISINE = '13000000-0000-0000-0000-000000000401';
  const HOLDING = '13000000-0000-0000-0000-000000000999';
  const TARGETS = [
    '14000000-0000-0000-0000-000000040101', // Taille
    '14000000-0000-0000-0000-000000040102', // Couleur
    '14000000-0000-0000-0000-000000040103', // Matière
  ];

  it('names exactly the three target characteristics', () => {
    for (const id of TARGETS) expect(executable).toContain(id);
    const attrIds = new Set(executable.match(/14000000-[0-9a-f-]{24,}/g) ?? []);
    expect([...attrIds].sort()).toEqual([...TARGETS].sort());
  });

  it('DELETES NOTHING — historical rows are preserved, never destroyed', () => {
    expect(executable).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executable).not.toMatch(/\bTRUNCATE\b/i);
    expect(executable).not.toMatch(/\bDROP\b/i);
  });

  it('writes ONLY product_attributes — not one specification row is touched', () => {
    const writes = new Set(
      (executable.match(/(?:INSERT INTO|UPDATE)\s+"(\w+)"/g) ?? []).map((m) => m.replace(/.*"(\w+)"/, '$1')),
    );
    expect([...writes]).toEqual(['product_attributes']);
    for (const t of ['products', 'categories', 'brands', 'brand_categories', 'orders', 'order_items']) {
      expect(executable).not.toMatch(new RegExp(`(?:INSERT INTO|UPDATE|DELETE FROM)\\s+"${t}"`));
    }
    expect(executable).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+"product_specifications"/);
  });

  it('creates no replacement characteristic and no new category', () => {
    expect(executable).not.toMatch(/INSERT INTO "product_attributes"/);
    expect(executable).not.toMatch(/INSERT INTO "categories"/);
  });

  it('the single UPDATE is keyed on the exact ids AND the expected current owner', () => {
    const updates = executable.match(/UPDATE "product_attributes"[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(1);
    const u = updates[0]!;
    expect(u).toMatch(/"id" = ANY\(v_ids\)/);
    expect(u).toMatch(/"categoryId" = v_cuisine/);
    expect(u).toMatch(/SET\s+"categoryId" = v_holding/);
    // only the owner and the timestamp may change
    const set = u.slice(u.indexOf('SET'), u.indexOf('WHERE'));
    expect(set.match(/"(\w+)"\s*=/g)?.sort()).toEqual(['"categoryId" =', '"updatedAt" =']);
  });

  it('NEVER matches on a characteristic NAME — the holding category already has several « Taille » and « Matière »', () => {
    // A name-keyed migration here would hit the wrong rows outright. Every
    // comparison form is refused, not just `=`: a mutation using `IN (...)`
    // slipped past an earlier, narrower version of this assertion.
    expect(executable).not.toMatch(/"name"\s*(?:=|<>|!=|~|IN\b|LIKE|ILIKE|ANY|SIMILAR)/i);
    // …and the name must never appear as a literal in executable SQL at all.
    for (const label of ['Taille', 'Couleur', 'Matière']) {
      expect(executable).not.toContain(`'${label}'`);
    }
  });

  it('the pre-state check is itself keyed on the ids AND the expected owner', () => {
    // A precondition that counted by id alone would approve rows that had
    // already been moved, and the drift refusal would never fire.
    const check = executable.slice(
      executable.indexOf('INTO v_on_cuisine'),
      executable.indexOf('INTO v_on_holding'),
    );
    expect(check).toMatch(/"id" = ANY\(v_ids\)/);
    expect(check).toMatch(/"categoryId" = v_cuisine/);
  });

  it('refuses unless a LIVE product reference count of ZERO is proven inside the block', () => {
    // The hard safety condition: hiding a characteristic a live product uses
    // would strand seller data.
    expect(executable).toMatch(/v_live_refs/);
    expect(executable).toMatch(/pr\."deletedAt" IS NULL/);
    expect(executable).toMatch(/IF v_live_refs <> 0 THEN/);
    expect(executable).toMatch(/RAISE EXCEPTION 'P3-4b REFUSED: % specification\(s\) on LIVE products/);
  });

  it('refuses a drifted owner and a missing holding category', () => {
    expect(executable).toMatch(/IF v_on_cuisine <> 3 THEN/);
    expect(executable).toMatch(/RAISE EXCEPTION 'P3-4b REFUSED[\s\S]*?holding category/);
    const raises = executable.match(/RAISE EXCEPTION 'P3-4b REFUSED/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(3);
  });

  it('is idempotent: an already-applied state is a NOTICE, never an error', () => {
    expect(executable).toMatch(/IF v_on_holding = 3 AND v_on_cuisine = 0 THEN/);
    expect(executable).toMatch(/RAISE NOTICE 'P3-4b already applied/);
    expect(executable).toMatch(/RETURN;/);
  });

  it('verifies its own end state, including that the history did not change', () => {
    const aborts = executable.match(/RAISE EXCEPTION 'P3-4b ABORTED/g) ?? [];
    expect(aborts.length).toBeGreaterThanOrEqual(4);
    expect(executable).toMatch(/v_moved <> 3/);
    expect(executable).toMatch(/<> v_hist_before/);
  });

  it('runs as ONE atomic block, so a refusal part-way writes nothing', () => {
    expect(executable.match(/DO \$\$/g)).toHaveLength(1);
    expect(executable).toMatch(/END \$\$;/);
  });

  it('re-homes onto the EXISTING holding category from P2 PR B', () => {
    expect(executable).toContain(HOLDING);
    expect(executable).toContain(CUISINE);
  });

  it('leaves the remaining Group B characteristics for P3-4c and P3-4d', () => {
    for (const attr of [
      '14000000-0000-0000-0000-000000010202', // oil « Type »  → P3-4d
      '14000000-0000-0000-0000-000000030501', // iron « Type » → P3-4c
    ]) {
      expect(executable).not.toContain(attr);
    }
  });

  it('carries a rollback restoring all three original owners', () => {
    const rollback = raw.slice(raw.indexOf('-- ── ROLLBACK'));
    for (const id of TARGETS) expect(rollback).toContain(id);
    expect(rollback.match(/^-- UPDATE "product_attributes"/gm)).toHaveLength(3);
    expect(rollback).toContain(CUISINE);
  });

  it('is NOT auto-applied — a data change is reviewed, not replayed on deploy', () => {
    const list = readFileSync(join(MANUAL_DIR, 'auto-apply.list'), 'utf8')
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(list).not.toContain(FILE);
  });
});

/**
 * P3-4c — the canonical « Type » for « Fers à repasser ».
 *
 * vibk3l's « Type » = "Fer à sec" hung off « Électronique > Réseau & Internet »
 * (another 2026-06-24 id reuse): buyers saw it, the seller form never offered
 * it. No canonical equivalent existed anywhere in the taxonomy, so the source
 * gains a dedicated IRON template and this migration materialises it.
 *
 * THE ARCHITECTURAL RISK THESE TESTS EXIST FOR: « Type » must NOT be appended
 * to APP_GENERIC, which « Aspirateurs » also uses — that would offer a vacuum
 * cleaner « Fer à vapeur ».
 */
describe('the canonical iron « Type » (P3-4c)', () => {
  const FILE = '2026-09-11_canonical_iron_type.sql';
  const raw = readFileSync(join(MANUAL_DIR, FILE), 'utf8');
  const executable = raw.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  const IRON_LEAF = 20 * 0 + 40501;   // Entretien Maison > Fers à repasser
  const VACUUM_LEAF = 40502;          // Aspirateurs — must stay untouched
  const SPEC = '7476a834-8ca6-423d-94b6-f1e9e6bc3f4b';
  const LEGACY = '14000000-0000-0000-0000-000000030501';
  const HOLDING = '13000000-0000-0000-0000-000000000999';
  const OPTIONS = ['Fer à sec', 'Fer à vapeur', 'Centrale vapeur', 'Défroisseur'];

  it('the source declares « Type » on the iron leaf with exactly the four options', () => {
    const rows = attributeRowsFor([IRON_LEAF]);
    const type = rows.find((a) => a.name === 'Type');
    expect(type).toBeDefined();
    expect(type!.options).toEqual(OPTIONS);
    expect(type!.type).toBe('SELECT');
  });

  it('« Type » is appended LAST so no existing id is renumbered', () => {
    const rows = attributeRowsFor([IRON_LEAF]);
    expect(rows.map((a) => a.name)).toEqual(['Puissance', 'Garantie', 'Type']);
    // Positional ids: the two pre-existing rows keep …101 and …102.
    expect(rows[0]!.id).toBe(attributeIdFor(IRON_LEAF, 0));
    expect(rows[0]!.id).toBe('14000000-0000-0000-0000-000004050101');
    expect(rows[1]!.id).toBe('14000000-0000-0000-0000-000004050102');
    expect(rows[2]!.id).toBe('14000000-0000-0000-0000-000004050103');
  });

  it('ASPIRATEURS DOES NOT RECEIVE « Type » — the APP_GENERIC sharing trap', () => {
    const vacuum = attributeRowsFor([VACUUM_LEAF]);
    expect(vacuum.map((a) => a.name)).toEqual(['Puissance', 'Garantie']);
    expect(vacuum.some((a) => a.name === 'Type')).toBe(false);
    // and its ids are untouched
    expect(vacuum[0]!.id).toBe('14000000-0000-0000-0000-000004050201');
    expect(vacuum[1]!.id).toBe('14000000-0000-0000-0000-000004050202');
  });

  it('no OTHER leaf gained a characteristic from this change', () => {
    // Every canonical id is still unique and every leaf still resolves.
    const seen = new Set<string>();
    for (const key of allLeafKeys()) {
      for (const a of attributeRowsFor([key])) {
        expect(seen.has(a.id)).toBe(false);
        seen.add(a.id);
      }
    }
  });

  it('the migration targets the id the SOURCE declares, not a hand-picked one', () => {
    const type = attributeRowsFor([IRON_LEAF]).find((a) => a.name === 'Type')!;
    expect(executable).toContain(type.id);
  });

  it('DELETES NOTHING', () => {
    expect(executable).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executable).not.toMatch(/\bTRUNCATE\b/i);
    expect(executable).not.toMatch(/\bDROP\b/i);
  });

  it('touches only product_attributes and product_specifications', () => {
    const writes = new Set(
      (executable.match(/(?:INSERT INTO|UPDATE)\s+"(\w+)"/g) ?? []).map((m) => m.replace(/.*"(\w+)"/, '$1')),
    );
    expect([...writes].sort()).toEqual(['product_attributes', 'product_specifications']);
    for (const t of ['products', 'categories', 'brands', 'brand_categories', 'orders', 'order_items']) {
      expect(executable).not.toMatch(new RegExp(`(?:INSERT INTO|UPDATE|DELETE FROM)\\s+"${t}"`));
    }
  });

  it('creates no category — « Repassage » / « Défroisseurs » stay out of scope', () => {
    expect(executable).not.toMatch(/INSERT INTO "categories"/);
    expect(executable).not.toContain('Repassage');
  });

  it('repoints exactly ONE specification, keyed on id AND productId AND attributeId AND value', () => {
    const updates = executable.match(/UPDATE "product_specifications"[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(1);
    const u = updates[0]!;
    const where = u.slice(u.indexOf('WHERE'));
    expect(where).toMatch(/"id" = v_spec/);
    expect(where).toMatch(/"productId" = v_product/);
    expect(where).toMatch(/"attributeId" = v_old_attr/);
    expect(where).toMatch(/"value" = v_value/);
    const set = u.slice(u.indexOf('SET'), u.indexOf('WHERE'));
    expect(set.match(/"(\w+)"\s*=/g)?.sort()).toEqual(['"attributeId" =', '"updatedAt" =']);
  });

  it('the pre-state check is itself keyed on all four columns', () => {
    const check = executable.slice(executable.indexOf('INTO v_points_old'), executable.indexOf('INTO v_points_new'));
    expect(check).toMatch(/"id" = v_spec/);
    expect(check).toMatch(/"productId" = v_product/);
    expect(check).toMatch(/"attributeId" = v_old_attr/);
    expect(check).toMatch(/"value" = v_value/);
  });

  it('retires the legacy attribute onto the EXISTING holding category', () => {
    const updates = executable.match(/UPDATE "product_attributes"[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatch(/"id" = v_old_attr/);
    expect(updates[0]).toMatch(/"categoryId" = v_old_home/);
    expect(executable).toContain(HOLDING);
  });

  it('refuses a destination that is missing, inactive or no longer a leaf', () => {
    expect(executable).toMatch(/NOT EXISTS \(SELECT 1 FROM "categories" k WHERE k\."parentCategoryId" = c\."id"/);
    expect(executable).toMatch(/RAISE EXCEPTION 'P3-4c REFUSED[\s\S]*?no longer a leaf/);
    // The CONDITION must be live, not just present: a mutation that turned this
    // into `IF false THEN` left every other assertion here satisfied.
    expect(executable).toMatch(/IF v_leaf_ok <> 1 THEN/);
  });

  it('is refusal-first on drifted value, drifted owner and collision', () => {
    expect(executable).toMatch(/v_points_old <> 1/);
    expect(executable).toMatch(/v_attr_home <> v_old_home/);
    expect(executable).toMatch(/v_collision <> 0/);
    expect((executable.match(/RAISE EXCEPTION 'P3-4c REFUSED/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('is idempotent: already applied is a NOTICE and the INSERT is guarded', () => {
    expect(executable).toMatch(/v_points_new = 1 AND v_attr_home = v_holding/);
    expect(executable).toMatch(/RAISE NOTICE 'P3-4c already applied/);
    expect(executable).toMatch(/ON CONFLICT \("id"\) DO NOTHING/);
  });

  it('asserts its own end state, INCLUDING that Aspirateurs is untouched', () => {
    expect((executable.match(/RAISE EXCEPTION 'P3-4c ABORTED/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(executable).toMatch(/must never reach it/);
    // Pin the EXACT expected count. Aspirateurs carries Puissance + Garantie and
    // nothing else; a mutation that relaxed this to `<> 3` would have let the
    // new « Type » land there unnoticed.
    expect(executable).toMatch(
      /WHERE "categoryId" = '16000000-0000-0000-0000-000000040502'\) <> 2/,
    );
  });

  it('no WRITE statement targets rows by characteristic NAME — « Type » exists on a dozen leaves', () => {
    // The risk is a write whose WHERE selects by name; a post-condition that
    // READS `"name" = 'Type'` to confirm the row it just created (keyed on id
    // first) is verification, not targeting, and is deliberately allowed.
    const writes = executable.match(/(?:UPDATE|INSERT INTO|DELETE FROM) "\w+"[\s\S]*?;/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      const where = w.includes('WHERE') ? w.slice(w.indexOf('WHERE')) : '';
      expect(where).not.toMatch(/"name"\s*(?:=|<>|!=|~|IN\b|LIKE|ILIKE|ANY|SIMILAR)/);
    }
    // and every write is keyed on an explicit id
    for (const w of writes) expect(w).toMatch(/v_(spec|old_attr|new_attr)\b/);
  });

  it('runs as ONE atomic block', () => {
    expect(executable.match(/DO \$\$/g)).toHaveLength(1);
    expect(executable).toMatch(/END \$\$;/);
  });

  it('leaves the oil « Type » for P3-4d', () => {
    expect(executable).not.toContain('14000000-0000-0000-0000-000000010202');
  });

  it('documents the THREE rollback levels and refuses a naive DELETE of the created row', () => {
    const rollback = raw.slice(raw.indexOf('-- ── ROLLBACK'));
    expect(rollback).toContain(SPEC);
    expect(rollback).toContain(LEGACY);
    expect(rollback).toMatch(/DO NOT DELETE the created attribute while the declaration stands/);
    expect(rollback).toMatch(/taxonomy:apply would regenerate it|regenerate it/);
    expect(rollback).toMatch(/A\. DATABASE MIGRATION ROLLBACK/);
    expect(rollback).toMatch(/B\. CODE \/ DECLARATION ROLLBACK/);
    expect(rollback).toMatch(/C\. FULL RELEASE ROLLBACK/);
  });

  it('is NOT auto-applied', () => {
    const list = readFileSync(join(MANUAL_DIR, 'auto-apply.list'), 'utf8')
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(list).not.toContain(FILE);
  });
});

/**
 * P3-4d — the canonical « Type » for « Huiles ». Last of the P3 series.
 *
 * pocc99's « Type » = "Huile végétale" hung off « Supermarché > Boissons »: buyers
 * saw it, the seller form never offered it. The legacy option list also carried
 * Vinaigre / Sel / Épices / Sauce — product families, not oil types, and Teka
 * already has a « Condiments » leaf beside « Huiles ». The canonical attribute
 * therefore carries THREE oil types only.
 *
 * THE ARCHITECTURAL RISK: « Type » must NOT be appended to BEVERAGE, which FIVE
 * leaves share — that would offer bottled water « Huile de palme ».
 */
describe('the canonical oil « Type » (P3-4d)', () => {
  const FILE = '2026-09-11_canonical_oil_type.sql';
  const raw = readFileSync(join(MANUAL_DIR, FILE), 'utf8');
  const executable = raw.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  const OIL_LEAF = 10107;                 // Alimentation > Huiles
  const BEVERAGE_LEAVES = [10201, 10202, 10203, 10206]; // Eau, Jus, Sodas, Boissons énergétiques
  const CONDIMENTS = 10108;
  const LEGACY = '14000000-0000-0000-0000-000000010202';
  const OPTIONS = ['Huile végétale', "Huile d'olive", 'Huile de palme'];
  const EXCLUDED = ['Vinaigre', 'Sel', 'Épices', 'Sauce'];

  it('the source declares « Type » on the oil leaf with exactly the three approved options', () => {
    const type = attributeRowsFor([OIL_LEAF]).find((a) => a.name === 'Type');
    expect(type).toBeDefined();
    expect(type!.options).toEqual(OPTIONS);
    expect(type!.type).toBe('SELECT');
  });

  it('the excluded condiment values are NOT canonical oil options', () => {
    const type = attributeRowsFor([OIL_LEAF]).find((a) => a.name === 'Type')!;
    for (const bad of EXCLUDED) expect(type.options).not.toContain(bad);
    // …and « Condiments » exists as their real home, which is why they are dropped.
    expect(attributeRowsFor([CONDIMENTS]).length).toBeGreaterThan(0);
  });

  it('« Type » is appended LAST so no existing id is renumbered', () => {
    const rows = attributeRowsFor([OIL_LEAF]);
    expect(rows.map((a) => a.name)).toEqual(['Volume', "Date d'expiration", 'Type']);
    expect(rows[0]!.id).toBe('14000000-0000-0000-0000-000001010701');
    expect(rows[1]!.id).toBe('14000000-0000-0000-0000-000001010702');
    expect(rows[2]!.id).toBe(attributeIdFor(OIL_LEAF, 2));
    expect(rows[2]!.id).toBe('14000000-0000-0000-0000-000001010703');
  });

  it('NO BEVERAGE LEAF RECEIVES « Type » — the shared-template trap', () => {
    for (const leaf of BEVERAGE_LEAVES) {
      const rows = attributeRowsFor([leaf]);
      expect(rows.map((a) => a.name)).toEqual(['Volume', "Date d'expiration"]);
      expect(rows.some((a) => a.name === 'Type')).toBe(false);
    }
    // Eau keeps its own ids untouched.
    expect(attributeRowsFor([10201])[0]!.id).toBe('14000000-0000-0000-0000-000001020101');
  });

  it('every canonical id is still unique across the whole taxonomy', () => {
    const seen = new Set<string>();
    for (const key of allLeafKeys()) {
      for (const a of attributeRowsFor([key])) {
        expect(seen.has(a.id)).toBe(false);
        seen.add(a.id);
      }
    }
  });

  it('the migration targets the id the SOURCE declares', () => {
    const type = attributeRowsFor([OIL_LEAF]).find((a) => a.name === 'Type')!;
    expect(executable).toContain(type.id);
  });

  it('DELETES NOTHING', () => {
    expect(executable).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executable).not.toMatch(/\bTRUNCATE\b/i);
    expect(executable).not.toMatch(/\bDROP\b/i);
  });

  it('touches only product_attributes and product_specifications', () => {
    const writes = new Set(
      (executable.match(/(?:INSERT INTO|UPDATE)\s+"(\w+)"/g) ?? []).map((m) => m.replace(/.*"(\w+)"/, '$1')),
    );
    expect([...writes].sort()).toEqual(['product_attributes', 'product_specifications']);
    expect(executable).not.toMatch(/INSERT INTO "categories"/);
  });

  it('repoints exactly ONE specification, keyed on id AND productId AND attributeId AND value', () => {
    const updates = executable.match(/UPDATE "product_specifications"[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(1);
    const u = updates[0]!;
    const where = u.slice(u.indexOf('WHERE'));
    expect(where).toMatch(/"id" = v_spec/);
    expect(where).toMatch(/"productId" = v_product/);
    expect(where).toMatch(/"attributeId" = v_old_attr/);
    expect(where).toMatch(/"value" = v_value/);
    const set = u.slice(u.indexOf('SET'), u.indexOf('WHERE'));
    expect(set.match(/"(\w+)"\s*=/g)?.sort()).toEqual(['"attributeId" =', '"updatedAt" =']);
  });

  it('the product is pinned by UUID, not resolved by a lookup', () => {
    expect(executable).toMatch(/v_product\s+CONSTANT uuid := '[0-9a-f-]{36}'/);
    expect(executable).not.toMatch(/v_product[\s\S]{0,80}SELECT "id" FROM "products"/);
  });

  it('REFUSES unless exactly 1 live and 4 historical references exist, 2 of them « Sel »', () => {
    expect(executable).toMatch(/IF v_live_refs <> 1 THEN/);
    expect(executable).toMatch(/IF v_hist_refs <> 4 THEN/);
    expect(executable).toMatch(/IF v_hist_sel <> 2 THEN/);
  });

  it('NEVER repoints or rewrites a historical row', () => {
    // The only specification write is the single live repoint above, and its
    // WHERE pins the live value. Nothing addresses « Sel » as a write target.
    const writes = executable.match(/UPDATE "product_specifications"[\s\S]*?;/g) ?? [];
    expect(writes).toHaveLength(1);
    for (const w of writes) expect(w).not.toContain("'Sel'");
  });

  it('asserts the historical rows survive, INCLUDING both « Sel »', () => {
    expect(executable).toMatch(/WHERE "attributeId" = v_old_attr\) <> 4/);
    expect(executable).toMatch(/"value" = 'Sel'\) <> 2/);
    expect(executable).toMatch(/must remain on the legacy attribute, unchanged/);
  });

  it('asserts NO beverage leaf gained a characteristic', () => {
    expect(executable).toMatch(/v_bev_before/);
    expect(executable).toMatch(/= ANY\(v_beverages\)\) <> v_bev_before/);
    expect(executable).toMatch(/EXISTS \(SELECT 1 FROM "product_attributes" WHERE "categoryId" = ANY\(v_beverages\) AND "name" = 'Type'\)/);
    expect(executable).toMatch(/must never reach Eau, Jus, Sodas, Café, Thé or Boissons énergétiques/);
  });

  it('refuses a pre-existing canonical row in an incompatible form', () => {
    expect(executable).toMatch(/already exists in an incompatible form/);
    expect(executable).toMatch(/v_existing IS NOT NULL/);
  });

  it('refuses a destination that is missing, inactive or no longer a leaf', () => {
    expect(executable).toMatch(/IF v_leaf_ok <> 1 THEN/);
    expect(executable).toMatch(/no longer a leaf/);
  });

  it('is refusal-first and idempotent', () => {
    expect((executable.match(/RAISE EXCEPTION 'P3-4d REFUSED/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(executable).toMatch(/v_points_new = 1 AND v_attr_home = v_holding/);
    expect(executable).toMatch(/RAISE NOTICE 'P3-4d already applied/);
    expect(executable).toMatch(/ON CONFLICT \("id"\) DO NOTHING/);
  });

  it('asserts its own end state', () => {
    expect((executable.match(/RAISE EXCEPTION 'P3-4d ABORTED/g) ?? []).length).toBeGreaterThanOrEqual(9);
  });

  it('runs as ONE atomic block', () => {
    expect(executable.match(/DO \$\$/g)).toHaveLength(1);
    expect(executable).toMatch(/END \$\$;/);
  });

  it('no WRITE statement targets rows by characteristic NAME', () => {
    const writes = executable.match(/(?:UPDATE|INSERT INTO) "\w+"[\s\S]*?;/g) ?? [];
    for (const w of writes) {
      const where = w.includes('WHERE') ? w.slice(w.indexOf('WHERE')) : '';
      expect(where).not.toMatch(/"name"\s*(?:=|<>|!=|~|IN\b|LIKE|ILIKE)/);
    }
  });

  it('documents the three rollback levels and refuses a naive DELETE', () => {
    const rb = raw.slice(raw.indexOf('-- ── ROLLBACK'));
    expect(rb).toContain('5bf39dfd-925b-461e-8a4c-07028a2a183d');
    expect(rb).toContain(LEGACY);
    expect(rb).toMatch(/A\. DATABASE MIGRATION ROLLBACK/);
    expect(rb).toMatch(/B\. CODE \/ DECLARATION ROLLBACK/);
    expect(rb).toMatch(/C\. FULL RELEASE ROLLBACK/);
    expect(rb).toMatch(/DO NOT DELETE the created attribute while the declaration stands/);
  });

  it('is NOT auto-applied', () => {
    const list = readFileSync(join(MANUAL_DIR, 'auto-apply.list'), 'utf8')
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(list).not.toContain(FILE);
  });

  it('leaves the earlier P3-4 corrections alone', () => {
    for (const attr of [
      '14000000-0000-0000-0000-000000020102', // P3-4a Mémoire interne
      '14000000-0000-0000-0000-000000040101', // P3-4b Taille
      '14000000-0000-0000-0000-000000030501', // P3-4c iron Type
    ]) {
      expect(executable).not.toContain(attr);
    }
  });
});
