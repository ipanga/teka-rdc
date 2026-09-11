/**
 * Structural taxonomy invariants — pure functions over plain data.
 *
 * WHY THESE EXIST
 *   Three production defects in September 2026 shared one shape: a category id
 *   acquiring a second meaning. The 2026-06-24 refactor reused every
 *   `13000000-` subcategory id with a new name while the old attributes stayed
 *   attached, which put « Type de peau » on men's clothing, « Pointure » on air
 *   conditioning and « Nombre de feux » on computing. Products were remapped
 *   onto the new tree but their specifications were not, so a whisky rendered
 *   « Type : Bière » to buyers for weeks.
 *
 *   None of that was detectable by a test, because the checks that existed
 *   compared source to source. These functions take the SHAPE of the data —
 *   categories, attributes, specifications, migration text — so the same logic
 *   can be unit-tested with fixtures in CI and run against a real database by
 *   `prisma/scripts/audit-taxonomy-invariants.ts`.
 *
 * DELIBERATELY NOT hardcoded around ids 106/107. The audit proved the reuse is
 * systemic (25 live intermediate categories, 52 attributes), so a guard that
 * names the two ids I happened to touch would protect nothing.
 */

export interface CategoryNode {
  id: string;
  name: string;
  parentCategoryId: string | null;
  isActive: boolean;
  deletedAt: Date | string | null;
}

export interface AttributeNode {
  id: string;
  categoryId: string;
  name: string;
}

export interface SpecificationNode {
  id: string;
  productId: string;
  attributeId: string;
}

export interface ProductNode {
  id: string;
  shortCode: string | null;
  categoryId: string;
  status: string;
  deletedAt: Date | string | null;
}

const isLive = (c: CategoryNode) => c.isActive && !c.deletedAt;

/**
 * A node is INTERMEDIATE when it still has a live child.
 *
 * This mirrors `BrowseService.getCategoryAttributes`, which returns `[]` for
 * any category with a non-deleted child and otherwise serves only that
 * category's own rows — leaf-only, never walking the parent chain. Verified
 * against production: « Mode > Homme » returns 0 attributes, its leaf
 * « Chemises » returns 3.
 */
export function buildLiveChildIndex(categories: CategoryNode[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of categories) {
    if (!isLive(c) || !c.parentCategoryId) continue;
    counts.set(c.parentCategoryId, (counts.get(c.parentCategoryId) ?? 0) + 1);
  }
  return counts;
}

export function isLiveLeaf(category: CategoryNode, liveChildren: Map<string, number>): boolean {
  return isLive(category) && (liveChildren.get(category.id) ?? 0) === 0;
}

/**
 * INVARIANT 1 — seller-selectable characteristics belong to live LEAF
 * categories.
 *
 * A live intermediate node carrying attributes is latent breakage: the API
 * hides them today, but the moment that node loses its children it becomes a
 * leaf and starts serving them. `allowlist` holds category ids with a
 * documented exception; anything else is a violation.
 */
export function findIntermediateAttributeViolations(
  categories: CategoryNode[],
  attributes: AttributeNode[],
  allowlist: ReadonlySet<string> = new Set(),
): { categoryId: string; categoryName: string; attributeId: string; attributeName: string }[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const liveChildren = buildLiveChildIndex(categories);

  return attributes.flatMap((a) => {
    const category = byId.get(a.categoryId);
    if (!category || !isLive(category)) return [];
    if (isLiveLeaf(category, liveChildren)) return [];
    if (allowlist.has(category.id)) return [];
    return [{
      categoryId: category.id,
      categoryName: category.name,
      attributeId: a.id,
      attributeName: a.name,
    }];
  });
}

/**
 * INVARIANT 2 — an ACTIVE product must not carry a specification whose
 * attribute belongs to a different category.
 *
 * Such a row renders on the PDP but appears in no seller form, so it cannot be
 * corrected from the UI. `allowlist` is keyed by SPECIFICATION id, not by
 * product or category, so it can only ever excuse the exact rows it names —
 * an unknown future violation is never silently tolerated.
 */
export function findForeignActiveSpecifications(
  products: ProductNode[],
  attributes: AttributeNode[],
  specifications: SpecificationNode[],
  allowlist: ReadonlySet<string> = new Set(),
): { specificationId: string; shortCode: string | null; productCategoryId: string; attributeId: string; attributeCategoryId: string }[] {
  const attrById = new Map(attributes.map((a) => [a.id, a]));
  const activeById = new Map(
    products.filter((p) => !p.deletedAt && p.status === 'ACTIVE').map((p) => [p.id, p]),
  );

  return specifications.flatMap((s) => {
    const product = activeById.get(s.productId);
    if (!product) return [];
    const attribute = attrById.get(s.attributeId);
    if (!attribute || attribute.categoryId === product.categoryId) return [];
    if (allowlist.has(s.id)) return [];
    return [{
      specificationId: s.id,
      shortCode: product.shortCode,
      productCategoryId: product.categoryId,
      attributeId: s.attributeId,
      attributeCategoryId: attribute.categoryId,
    }];
  });
}

/**
 * INVARIANT 3 — a category id carries ONE semantic identity.
 *
 * Takes the raw text of every manual migration and collects the (id, name)
 * pairs each one writes. Two different names for one id means the id has been
 * repurposed, which is exactly what stranded 52 attributes on the wrong nodes.
 */
export function findCategoryIdentityConflicts(
  migrationSources: { file: string; sql: string }[],
): { categoryId: string; names: string[]; files: string[] }[] {
  const seen = new Map<string, { names: Set<string>; files: Set<string> }>();

  for (const { file, sql } of migrationSources) {
    const executable = stripSqlComments(sql);
    for (const stmt of executable.match(/INSERT INTO "categories"[\s\S]*?;/g) ?? []) {
      for (const m of stmt.matchAll(
        /\('((?:13|16)000000-[0-9a-f-]+)',\s*(?:'(?:[^']|'')*'|NULL),\s*'((?:[^']|'')*)'/g,
      )) {
        const id = m[1];
        const name = m[2].replace(/''/g, "'");
        const entry = seen.get(id) ?? { names: new Set(), files: new Set() };
        entry.names.add(name);
        entry.files.add(file);
        seen.set(id, entry);
      }
    }
  }

  return [...seen.entries()]
    .filter(([, v]) => v.names.size > 1)
    .map(([categoryId, v]) => ({ categoryId, names: [...v.names], files: [...v.files] }));
}

/** Remove `--` comment lines so commentary can never satisfy a guard. */
export function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

/**
 * INVARIANT 4 — a migration that creates a leaf also materialises what the
 * canonical source declares for it.
 *
 * The 2026-09-10 release created six leaves and neither their characteristics
 * nor their brand links, because the tree was hand-written while the templates
 * live in `taxonomy-data.ts`. `declaredFor` is supplied by the caller from the
 * source of truth, which keeps this function free of taxonomy specifics.
 */
export function findUnmaterialisedDeclarations(
  migrationSources: { file: string; sql: string }[],
  declaredFor: (leafKey: number) => { attributeIds: string[]; brandLinks: { brandId: string; categoryId: string }[] },
): { leafKey: number; missing: string[] }[] {
  const insertedLeafIds = new Set<string>();
  const insertedAttributeIds = new Set<string>();
  const insertedLinks = new Set<string>();

  for (const { sql } of migrationSources) {
    const executable = stripSqlComments(sql);
    for (const stmt of executable.match(/INSERT INTO "categories"[\s\S]*?;/g) ?? []) {
      for (const id of stmt.match(/16000000-[0-9a-f-]+/g) ?? []) insertedLeafIds.add(id);
    }
    for (const stmt of executable.match(/INSERT INTO "product_attributes"[\s\S]*?;/g) ?? []) {
      for (const id of stmt.match(/14000000-[0-9a-f-]+/g) ?? []) insertedAttributeIds.add(id);
    }
    for (const stmt of executable.match(/INSERT INTO "brand_categories"[\s\S]*?;/g) ?? []) {
      for (const m of stmt.matchAll(/\('(15000000-[0-9a-f-]+)',\s*'(16000000-[0-9a-f-]+)'\)/g)) {
        insertedLinks.add(`${m[1]}|${m[2]}`);
      }
    }
  }

  const out: { leafKey: number; missing: string[] }[] = [];
  for (const leafId of insertedLeafIds) {
    const leafKey = Number(leafId.split('-').pop());
    const declared = declaredFor(leafKey);
    const missing = [
      ...declared.attributeIds.filter((id) => !insertedAttributeIds.has(id)).map((id) => `attribute ${id}`),
      ...declared.brandLinks
        .filter((l) => !insertedLinks.has(`${l.brandId}|${l.categoryId}`))
        .map((l) => `brand link ${l.brandId}`),
    ];
    if (missing.length) out.push({ leafKey, missing });
  }
  return out;
}

export interface BrandNode {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  deletedAt: Date | string | null;
}

/** Lowercase + strip accents + collapse whitespace — the comparison a human makes. */
export function normalizeBrandName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * INVARIANT 5 — one brand, one identity.
 *
 * Two rows for « Nestle » and « Nestlé », or « Coca Cola » and « Coca-Cola »,
 * split a seller's dropdown and a buyer's facet in half without ever looking
 * wrong in a list. The database's unique constraints are exact-match only, so
 * they do not catch spelling, accent or case variants.
 *
 * Retired rows are ignored: the `__old__…` placeholders left by the seed's
 * rename preamble are deliberately parked, not duplicates.
 */
export function findDuplicateBrandIdentities(
  brands: BrandNode[],
): { kind: 'name' | 'slug'; value: string; names: string[] }[] {
  const live = brands.filter((b) => b.isActive && !b.deletedAt);
  const out: { kind: 'name' | 'slug'; value: string; names: string[] }[] = [];

  const byName = new Map<string, string[]>();
  const bySlug = new Map<string, string[]>();
  for (const b of live) {
    const n = normalizeBrandName(b.name);
    byName.set(n, [...(byName.get(n) ?? []), b.name]);
    bySlug.set(b.slug, [...(bySlug.get(b.slug) ?? []), b.name]);
  }
  for (const [value, names] of byName) if (names.length > 1) out.push({ kind: 'name', value, names });
  for (const [value, names] of bySlug) if (names.length > 1) out.push({ kind: 'slug', value, names });
  return out;
}

/**
 * INVARIANT 6 — every live leaf keeps « Autre ».
 *
 * A seller listing something off-brand, handmade, or from a maker Teka does not
 * stock must always have an option. A leaf that loses « Autre » silently forces
 * a wrong brand or an abandoned listing.
 */
export function findLeavesMissingCatchAll(
  categories: CategoryNode[],
  brands: BrandNode[],
  links: { brandId: string; categoryId: string }[],
  catchAllName = 'Autre',
): { categoryId: string; categoryName: string }[] {
  const liveChildren = buildLiveChildIndex(categories);
  const catchAll = brands.find(
    (b) => normalizeBrandName(b.name) === normalizeBrandName(catchAllName) && b.isActive && !b.deletedAt,
  );
  if (!catchAll) return categories.filter((c) => isLiveLeaf(c, liveChildren)).map((c) => ({ categoryId: c.id, categoryName: c.name }));

  const linked = new Set(links.filter((l) => l.brandId === catchAll.id).map((l) => l.categoryId));
  return categories
    .filter((c) => isLiveLeaf(c, liveChildren) && !linked.has(c.id))
    .map((c) => ({ categoryId: c.id, categoryName: c.name }));
}

/**
 * The ONLY specifications currently excused from invariant 2.
 *
 * Every entry is a P3 residual recorded in `docs/pre-scale-readiness.md`:
 * six characteristics whose value is real seller data with no canonical home
 * in the taxonomy yet, and three duplicates on the shirt product that the
 * 2026-09-11 correction could not repoint because identical canonical rows
 * already existed (the unique-constraint guard refused them).
 *
 * REMOVE ENTRIES AS P3 RESOLVES THEM. This list must only ever shrink — it went
 * from 9 to 6 on 2026-09-11 when P3-2 removed the three shirt duplicates.
 */
export const P3_FOREIGN_SPECIFICATION_ALLOWLIST: ReadonlySet<string> = new Set([
  '5bf39dfd-925b-461e-8a4c-07028a2a183d', // pocc99 « Type » = "Huile végétale" — no canonical home
  'ab2bf530-4a3c-46a0-ab51-7eb0abea834f', // rt7ibz « Type » = "Lait en poudre" — value is not an option of the target
  '1f771953-aeb0-4e66-9b10-ce61df4c491b', // vnkqce « Type » = "Savon de lessive" — no canonical home
  '600d7c1c-c1cd-4c8d-ba15-e6502620fc4e', // foyug0 « Mémoire interne » = "16Go" — no canonical home
  'f71a9667-5233-4eef-a1a3-b468b32ac70e', // d3k7ei « Type » = "Blender" — no canonical home
  '7476a834-8ca6-423d-94b6-f1e9e6bc3f4b', // vibk3l « Type » = "Fer à sec" — no canonical home
]);
