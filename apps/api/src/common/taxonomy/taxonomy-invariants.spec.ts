import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  P3_FOREIGN_SPECIFICATION_ALLOWLIST,
  findCategoryIdentityConflicts,
  findForeignActiveSpecifications,
  findIntermediateAttributeViolations,
  findUnmaterialisedDeclarations,
  isLiveLeaf,
  buildLiveChildIndex,
  type CategoryNode,
} from './taxonomy-invariants';
import { STRICT_CATEGORIES } from '../../../prisma/taxonomy-data';
import {
  attributeIdFor,
  brandLinksFor,
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

  it('the P3 allowlist is minimal and documented — 9 known residual rows', () => {
    // Must only ever SHRINK. Six characteristics with no canonical home plus
    // three duplicates the 2026-09-11 correction could not repoint.
    expect(P3_FOREIGN_SPECIFICATION_ALLOWLIST.size).toBe(9);
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
