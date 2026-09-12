import {
  type DbSnapshot,
  additiveFindings,
  blockingFindings,
  buildReconciliationSql,
  canonicalLeaves,
  formatDiff,
  isCanonicalId,
  strictAttrId,
  strictBrandId,
  strictCatId,
  strictTypeId,
  taxonomyDiff,
} from '../../../prisma/scripts/taxonomy-diff';
import { STRICT_BRANDS, STRICT_CATEGORIES } from '../../../prisma/taxonomy-data';

/**
 * Taxonomy reconciliation (2026-09-11, P2 PR D).
 *
 * The diff is a pure function over a database snapshot, so every scenario below
 * is a fixture rather than a live database. Each case is asserted BOTH ways
 * where it matters: a clean snapshot must produce nothing, and the specific
 * breakage must produce exactly the finding that names it.
 */

/** A snapshot that matches the canonical source exactly. */
function cleanSnapshot(): DbSnapshot {
  const categories = [];
  for (const dept of STRICT_CATEGORIES) {
    categories.push({ id: strictCatId(dept.n), name: dept.fr, parentCategoryId: null, isActive: true, deletedAt: null });
    for (const sub of dept.subs) {
      categories.push({ id: strictCatId(sub.n), name: sub.fr, parentCategoryId: strictCatId(dept.n), isActive: true, deletedAt: null });
      for (const t of sub.types) {
        categories.push({ id: strictTypeId(t.n), name: t.fr, parentCategoryId: strictCatId(sub.n), isActive: true, deletedAt: null });
      }
    }
  }
  const attributes = canonicalLeaves().flatMap((leaf) =>
    (leaf.attrs ?? []).map((a, slot) => ({
      id: strictAttrId(leaf.n * 100 + slot + 1), categoryId: strictTypeId(leaf.n), name: a.fr,
    })),
  );
  const brands = STRICT_BRANDS.map((b) => ({
    id: strictBrandId(b.n), name: b.fr,
    slug: b.fr.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    isActive: true, deletedAt: null,
  }));
  const allLeafKeys = canonicalLeaves().map((l) => l.n);
  const brandLinks = STRICT_BRANDS.flatMap((b) =>
    (b.types.length > 0 ? b.types : allLeafKeys).map((t) => ({ brandId: strictBrandId(b.n), categoryId: strictTypeId(t) })),
  );
  return { categories, attributes, brands, brandLinks, specificationCounts: new Map() };
}

const A_LEAF = canonicalLeaves().find((l) => (l.attrs ?? []).length > 0)!;
const A_LEAF_ID = strictTypeId(A_LEAF.n);

describe('a database matching the source produces an empty diff', () => {
  it('clean snapshot → no findings at all', () => {
    expect(taxonomyDiff(cleanSnapshot())).toEqual([]);
  });

  it('and the report says so plainly', () => {
    expect(formatDiff([])).toMatch(/matches the canonical source/);
  });

  it('the diff is deterministic — same input, identical output', () => {
    const a = JSON.stringify(taxonomyDiff(cleanSnapshot()));
    const b = JSON.stringify(taxonomyDiff(cleanSnapshot()));
    expect(a).toBe(b);
  });
});

describe('additive drift — what taxonomy:apply may reconcile', () => {
  it('detects a MISSING CATEGORY', () => {
    const db = cleanSnapshot();
    db.categories = db.categories.filter((c) => c.id !== A_LEAF_ID);
    const f = taxonomyDiff(db).filter((x) => x.kind === 'category.missing');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('DRIFT_ADDITIVE');
  });

  it('detects a MISSING CHARACTERISTIC — the 2026-09-10 incident', () => {
    const db = cleanSnapshot();
    const id = strictAttrId(A_LEAF.n * 100 + 1);
    db.attributes = db.attributes.filter((a) => a.id !== id);
    const f = taxonomyDiff(db).filter((x) => x.kind === 'attribute.missing');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('DRIFT_ADDITIVE');
  });

  it('detects a MISSING BRAND', () => {
    const db = cleanSnapshot();
    db.brands = db.brands.filter((b) => b.id !== strictBrandId(STRICT_BRANDS[1].n));
    expect(taxonomyDiff(db).some((x) => x.kind === 'brand.missing' && x.severity === 'DRIFT_ADDITIVE')).toBe(true);
  });

  it('detects a MISSING BRAND-CATEGORY LINK', () => {
    const db = cleanSnapshot();
    db.brandLinks = db.brandLinks.slice(1);
    expect(taxonomyDiff(db).some((x) => x.kind === 'brandLink.missing' && x.severity === 'DRIFT_ADDITIVE')).toBe(true);
  });

  it('detects a LIVE LEAF MISSING « Autre »', () => {
    const db = cleanSnapshot();
    const autre = db.brands.find((b) => b.name === 'Autre')!;
    db.brandLinks = db.brandLinks.filter((l) => !(l.brandId === autre.id && l.categoryId === A_LEAF_ID));
    const f = taxonomyDiff(db).filter((x) => x.kind === 'catchAll.missing');
    expect(f.length).toBeGreaterThanOrEqual(1);
    expect(f[0].severity).toBe('DRIFT_ADDITIVE');
  });
});

describe('needs a decision — never auto-applied', () => {
  it('a MISPLACED characteristic is JUDGEMENT, not additive', () => {
    const db = cleanSnapshot();
    const id = strictAttrId(A_LEAF.n * 100 + 1);
    db.attributes = db.attributes.map((a) => (a.id === id ? { ...a, categoryId: strictCatId(1) } : a));
    const f = taxonomyDiff(db).filter((x) => x.kind === 'attribute.misplaced');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('JUDGEMENT');
  });

  it('a characteristic ON AN INTERMEDIATE node is JUDGEMENT, and says whether data depends on it', () => {
    const db = cleanSnapshot();
    const subId = strictCatId(STRICT_CATEGORIES[0].subs[0].n);
    db.attributes.push({ id: strictAttrId(999901), categoryId: subId, name: 'Type de peau' });
    db.specificationCounts.set(strictAttrId(999901), 4);
    const f = taxonomyDiff(db).filter((x) => x.kind === 'attribute.onIntermediate');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('JUDGEMENT');
    expect(f[0].detail).toMatch(/4 specification\(s\) reference it/);
    expect(f[0].detail).toMatch(/never a delete/);
  });

  it('SEMANTIC ID REUSE — a canonical id the source no longer declares', () => {
    const db = cleanSnapshot();
    db.categories.push({ id: strictCatId(998), name: 'Ancienne catégorie', parentCategoryId: null, isActive: true, deletedAt: null });
    const f = taxonomyDiff(db).filter((x) => x.kind === 'category.unexpected');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('JUDGEMENT');
    expect(f[0].detail).toMatch(/id reused with a new meaning/);
  });

  it('a DUPLICATE LOGICAL BRAND is JUDGEMENT — merging is an Admin decision', () => {
    const db = cleanSnapshot();
    db.brands.push({ id: 'ffffffff-0000-0000-0000-000000000001', name: 'Nestle', slug: 'nestle-2', isActive: true, deletedAt: null });
    const f = taxonomyDiff(db).filter((x) => x.kind.startsWith('brand.duplicate'));
    expect(f.length).toBeGreaterThanOrEqual(1);
    expect(f.every((x) => x.severity === 'JUDGEMENT')).toBe(true);
  });

  it('a RENAMED canonical category is JUDGEMENT, and the detail defends the admin', () => {
    const db = cleanSnapshot();
    db.categories = db.categories.map((c) => (c.id === A_LEAF_ID ? { ...c, name: 'Renommé par un admin' } : c));
    const f = taxonomyDiff(db).filter((x) => x.kind === 'category.renamed');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('JUDGEMENT');
    expect(f[0].detail).toMatch(/Admin rename is legitimate/);
  });

  it('a DEACTIVATED canonical category is JUDGEMENT, never silently re-activated', () => {
    const db = cleanSnapshot();
    db.categories = db.categories.map((c) => (c.id === A_LEAF_ID ? { ...c, isActive: false } : c));
    expect(taxonomyDiff(db).some((x) => x.kind === 'category.inactive' && x.severity === 'JUDGEMENT')).toBe(true);
  });
});

describe('Admin-created taxonomy is not drift', () => {
  it('an Admin-created category is ADMIN, never missing or unexpected drift', () => {
    const db = cleanSnapshot();
    db.categories.push({
      id: '26003c90-f73b-49b0-afab-cc6961cd7746', name: 'Catégorie créée par un admin',
      parentCategoryId: null, isActive: true, deletedAt: null,
    });
    const f = taxonomyDiff(db).filter((x) => x.kind === 'category.adminCreated');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('ADMIN');
    expect(additiveFindings(taxonomyDiff(db)).some((x) => x.id === db.categories.at(-1)!.id)).toBe(false);
  });

  it('an Admin-created LEAF missing « Autre » is ADMIN, not additive drift', () => {
    // The tool must not generate SQL for a category the source knows nothing about.
    const db = cleanSnapshot();
    const parent = strictCatId(STRICT_CATEGORIES[0].subs[0].n);
    db.categories.push({
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', name: 'Feuille admin',
      parentCategoryId: parent, isActive: true, deletedAt: null,
    });
    const f = taxonomyDiff(db).filter((x) => x.kind === 'catchAll.missing' && x.id === 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('ADMIN');
  });

  it('the canonical/Admin boundary is drawn on the id range, unambiguously', () => {
    expect(isCanonicalId(strictCatId(1))).toBe(true);
    expect(isCanonicalId(strictTypeId(10101))).toBe(true);
    expect(isCanonicalId(strictAttrId(1010101))).toBe(true);
    expect(isCanonicalId(strictBrandId(1))).toBe(true);
    expect(isCanonicalId('26003c90-f73b-49b0-afab-cc6961cd7746')).toBe(false);
  });
});

describe('historical data is preserved, not reconciled away', () => {
  it('a characteristic on a retired category with specifications is HISTORICAL', () => {
    const db = cleanSnapshot();
    db.categories.push({ id: strictCatId(997), name: 'Retirée', parentCategoryId: null, isActive: false, deletedAt: new Date() });
    db.attributes.push({ id: strictAttrId(999701), categoryId: strictCatId(997), name: 'Poids' });
    db.specificationCounts.set(strictAttrId(999701), 12);
    const f = taxonomyDiff(db).filter((x) => x.kind === 'attribute.referencedHistorical');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('HISTORICAL');
    expect(f[0].detail).toMatch(/deleting orphans real history/);
  });

  // The finding counts an attribute whose OWNER CATEGORY is retired and which
  // still has references. `specificationCounts` is a groupBy over every
  // specification — the product's own state is never consulted — so the wording
  // must not promise the referencing products are soft-deleted. In production 3
  // of the 80 counted characteristics are referenced by ACTIVE products.
  it('counts a retired-category characteristic referenced by a LIVE product too', () => {
    const db = cleanSnapshot();
    db.categories.push({ id: strictCatId(995), name: 'Retirée', parentCategoryId: null, isActive: false, deletedAt: new Date() });
    db.attributes.push({ id: strictAttrId(999501), categoryId: strictCatId(995), name: 'Type' });
    db.specificationCounts.set(strictAttrId(999501), 1);
    const f = taxonomyDiff(db).filter((x) => x.kind === 'attribute.referencedHistorical');
    expect(f).toHaveLength(1);
    expect(f[0].label).toMatch(/^1 characteristic\(s\) on retired categories$/);
    // The snapshot carries no product state at all, so the detail may not claim one.
    expect(f[0].detail).not.toMatch(/soft-deleted products/);
    expect(f[0].detail).toMatch(/any state/);
  });

  it('an unreferenced characteristic on a retired category is NOT reported', () => {
    const db = cleanSnapshot();
    db.categories.push({ id: strictCatId(994), name: 'Retirée', parentCategoryId: null, isActive: false, deletedAt: new Date() });
    db.attributes.push({ id: strictAttrId(999401), categoryId: strictCatId(994), name: 'Type' });
    expect(taxonomyDiff(db).some((x) => x.kind === 'attribute.referencedHistorical')).toBe(false);
  });

  it('soft-deleted categories are never reported as unexpected drift', () => {
    const db = cleanSnapshot();
    db.categories.push({ id: strictCatId(996), name: 'Ancienne', parentCategoryId: null, isActive: false, deletedAt: new Date() });
    expect(taxonomyDiff(db).some((x) => x.kind === 'category.unexpected')).toBe(false);
  });
});

describe('severity partitions decide what may be automated', () => {
  it('additive and blocking sets never overlap', () => {
    const db = cleanSnapshot();
    db.attributes = db.attributes.slice(1);                       // additive
    db.brands.push({ id: 'f1', name: 'Nestle', slug: 'n2', isActive: true, deletedAt: null }); // judgement
    const f = taxonomyDiff(db);
    const a = new Set(additiveFindings(f)); const b = new Set(blockingFindings(f));
    expect([...a].some((x) => b.has(x))).toBe(false);
    expect(a.size).toBeGreaterThan(0);
    expect(b.size).toBeGreaterThan(0);
  });

  it('ADMIN and HISTORICAL findings are in neither set — they are never acted on', () => {
    const db = cleanSnapshot();
    db.categories.push({ id: '11111111-2222-4333-8444-555555555555', name: 'Admin', parentCategoryId: null, isActive: true, deletedAt: null });
    const f = taxonomyDiff(db);
    const admin = f.filter((x) => x.severity === 'ADMIN');
    expect(admin.length).toBeGreaterThan(0);
    expect(additiveFindings(f).some((x) => admin.includes(x))).toBe(false);
    expect(blockingFindings(f).some((x) => admin.includes(x))).toBe(false);
  });

  it('the report groups by severity and names the safe set explicitly', () => {
    const db = cleanSnapshot();
    db.attributes = db.attributes.slice(1);
    const text = formatDiff(taxonomyDiff(db));
    expect(text).toMatch(/ADDITIVE DRIFT — safe to reconcile/);
    expect(text).toMatch(/attribute\.missing/);
  });
});

describe('buildReconciliationSql — the generated migration', () => {
  it('returns null when there is nothing additive to reconcile', () => {
    expect(buildReconciliationSql([])).toBeNull();
    expect(buildReconciliationSql(taxonomyDiff(cleanSnapshot()))).toBeNull();
  });

  it('emits ONLY additive SQL — no DELETE, UPDATE, DROP or TRUNCATE', () => {
    const db = cleanSnapshot();
    const id = strictAttrId(A_LEAF.n * 100 + 1);
    db.attributes = db.attributes.filter((a) => a.id !== id);
    const sql = buildReconciliationSql(taxonomyDiff(db))!;
    const executable = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    expect(executable).not.toMatch(/\b(DELETE|DROP|TRUNCATE|ALTER)\b/i);
    expect(executable).toMatch(/INSERT INTO "product_attributes"/);
  });

  it('is idempotent by construction — every write is ON CONFLICT', () => {
    const db = cleanSnapshot();
    db.attributes = db.attributes.slice(2);
    db.brandLinks = db.brandLinks.slice(5);
    const sql = buildReconciliationSql(taxonomyDiff(db))!;
    // Comments first — the header explains the ON CONFLICT policy in prose, and
    // counting that as a statement would make this pass for the wrong reason.
    const executable = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    const inserts = executable.match(/INSERT INTO "\w+"/g) ?? [];
    const conflicts = executable.match(/ON CONFLICT/g) ?? [];
    expect(inserts.length).toBeGreaterThan(0);
    expect(conflicts.length).toBe(inserts.length);
  });

  it('records what it reconciles, so a reviewer sees the intent without re-running the diff', () => {
    const db = cleanSnapshot();
    const id = strictAttrId(A_LEAF.n * 100 + 1);
    db.attributes = db.attributes.filter((a) => a.id !== id);
    const sql = buildReconciliationSql(taxonomyDiff(db))!;
    expect(sql).toMatch(/GENERATED by `pnpm taxonomy:apply`/);
    expect(sql).toMatch(/\[attribute\.missing\]/);
    expect(sql).toMatch(/REVIEW THIS FILE BEFORE MERGING/);
    expect(sql).toMatch(/not added to auto-apply\.list/);
  });

  it('a second run over the reconciled state produces nothing — apply is idempotent', () => {
    const db = cleanSnapshot();
    const id = strictAttrId(A_LEAF.n * 100 + 1);
    db.attributes = db.attributes.filter((a) => a.id !== id);
    expect(buildReconciliationSql(taxonomyDiff(db))).not.toBeNull();
    // simulate the migration having been applied
    db.attributes.push({ id, categoryId: strictTypeId(A_LEAF.n), name: A_LEAF.attrs![0].fr });
    expect(taxonomyDiff(db)).toEqual([]);
    expect(buildReconciliationSql(taxonomyDiff(db))).toBeNull();
  });

  it('never emits SQL for an Admin-created category', () => {
    const db = cleanSnapshot();
    const parent = strictCatId(STRICT_CATEGORIES[0].subs[0].n);
    const adminId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    db.categories.push({ id: adminId, name: 'Feuille admin', parentCategoryId: parent, isActive: true, deletedAt: null });
    const sql = buildReconciliationSql(taxonomyDiff(db));
    expect(sql === null || !sql.includes(adminId)).toBe(true);
  });
});
