/**
 * Renders `product_attributes` rows for a set of product-type leaves AS SQL,
 * derived from `taxonomy-data.ts` — the taxonomy source of truth.
 *
 * WHY THIS EXISTS
 *   `seed.ts` materialises the attribute templates, but a prod seed run is not
 *   a targeted tool: it opens by deactivating EVERY category and nulling every
 *   slug (`seed.ts` → "Deactivate all prior categories"), then renames the
 *   whole brand library. So a production taxonomy change ships as hand-written
 *   manual SQL instead — and on 2026-09-10 that hand-written SQL created eight
 *   category rows while silently omitting their attribute rows, because nothing
 *   tied the two definitions together.
 *
 *   This module is that tie. The SQL is GENERATED from the same tables seed.ts
 *   consumes, and `taxonomy-attribute-sql.spec.ts` re-renders it and compares
 *   against the committed migration, so the two can no longer drift.
 *
 * Pure data → string. No Prisma client, no DB, no filesystem writes.
 */
import { AttributeType } from '@prisma/client';
import { STRICT_BRANDS, STRICT_CATEGORIES, type AttrTpl } from '../taxonomy-data';

/** Deterministic id ranges — identical to `seed.ts`. */
export const strictTypeId = (n: number) =>
  `16000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const strictAttrId = (n: number) =>
  `14000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const strictBrandId = (n: number) =>
  `15000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

/** `seed.ts`: `strictAttrId(type.n * 100 + slot + 1)`, slot being 0-based. */
export const attributeIdFor = (typeKey: number, slotZeroBased: number) =>
  strictAttrId(typeKey * 100 + slotZeroBased + 1);

export interface AttributeRow {
  id: string;
  categoryId: string;
  typeKey: number;
  name: string;
  type: AttributeType;
  options: string[] | null;
  isRequired: boolean;
  /** 1-based, matching `seed.ts`'s `sortOrder: slot + 1`. */
  sortOrder: number;
}

const leafIndex = (): Map<number, { fr: string; attrs: AttrTpl[] }> => {
  const map = new Map<number, { fr: string; attrs: AttrTpl[] }>();
  for (const cat of STRICT_CATEGORIES) {
    for (const sub of cat.subs) {
      for (const type of sub.types) {
        map.set(type.n, { fr: type.fr, attrs: type.attrs ?? [] });
      }
    }
  }
  return map;
};

/**
 * The attribute rows `seed.ts` would write for `typeKeys`, in seed order.
 * Throws on an unknown key rather than silently emitting nothing — a leaf that
 * is not in the source of truth is a bug in the caller, not an empty result.
 */
export function attributeRowsFor(typeKeys: number[]): AttributeRow[] {
  const leaves = leafIndex();
  const rows: AttributeRow[] = [];
  for (const key of typeKeys) {
    const leaf = leaves.get(key);
    if (!leaf) {
      throw new Error(
        `product type ${key} is not defined in taxonomy-data.ts — refusing to generate SQL for it`,
      );
    }
    leaf.attrs.forEach((attr, slot) => {
      rows.push({
        id: attributeIdFor(key, slot),
        categoryId: strictTypeId(key),
        typeKey: key,
        name: attr.fr,
        type: attr.type,
        options: attr.options ?? null,
        isRequired: attr.isRequired ?? false,
        sortOrder: slot + 1,
      });
    });
  }
  return rows;
}

/** Single-quoted SQL string literal. */
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** `options` is `Json?` — a JSON array of strings, or SQL NULL. */
const optionsLit = (options: string[] | null) =>
  options === null ? 'NULL' : `${lit(JSON.stringify(options))}::jsonb`;

/**
 * One idempotent `INSERT … ON CONFLICT (id) DO UPDATE` covering every row.
 * The DO UPDATE arm mirrors `seed.ts`'s upsert `update:` block exactly, so a
 * row that already exists under a stale template is corrected in place rather
 * than skipped — which is what the canonical « Déodorants » leaf needs.
 */
export function renderAttributeSql(typeKeys: number[]): string {
  const rows = attributeRowsFor(typeKeys);
  if (rows.length === 0) return '';

  const values = rows
    .map(
      (r) =>
        `  (${lit(r.id)}, ${lit(r.categoryId)}, ${lit(r.name)}, ` +
        `'${r.type}'::"AttributeType", ${optionsLit(r.options)}, ` +
        `${r.isRequired ? 'TRUE' : 'FALSE'}, ${r.sortOrder}, NOW(), NOW())`,
    )
    .join(',\n');

  return [
    'INSERT INTO "product_attributes"',
    '  ("id", "categoryId", "name", "type", "options", "isRequired", "sortOrder", "createdAt", "updatedAt")',
    'VALUES',
    values,
    'ON CONFLICT ("id") DO UPDATE',
    '  SET "categoryId" = EXCLUDED."categoryId",',
    '      "name"       = EXCLUDED."name",',
    '      "type"       = EXCLUDED."type",',
    '      "options"    = EXCLUDED."options",',
    '      "isRequired" = EXCLUDED."isRequired",',
    '      "sortOrder"  = EXCLUDED."sortOrder",',
    '      "updatedAt"  = NOW();',
  ].join('\n');
}


// ────────────────────────────────────────────────────────────────────────────
// BRAND LIBRARY + BRAND↔LEAF LINKS
//
// The same gap that left the 2026-09-10 leaves without characteristics also
// left them without brands: `taxonomy-data.ts` declares which brands belong to
// which leaf, and only `seed.ts` reads it. A seller listing a beer got an empty
// brand dropdown. Rendered here so a migration can never again ship a leaf
// without the relationships the source of truth declares for it.
// ────────────────────────────────────────────────────────────────────────────

export interface BrandRow {
  id: string;
  n: number;
  name: string;
  slug: string;
  sortOrder: number;
}
export interface BrandLinkRow {
  brandId: string;
  brandName: string;
  categoryId: string;
  leafKey: number;
}

/** Mirrors `frSlugify` for the plain ASCII brand names in the library. */
const brandSlug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** Every leaf key declared anywhere in the tree, in seed order. */
export const allLeafKeys = (): number[] =>
  STRICT_CATEGORIES.flatMap((c) => c.subs.flatMap((s) => s.types.map((t) => t.n)));

/**
 * The brand↔leaf links `seed.ts` would write for `leafKeys`.
 *
 * A brand with an EMPTY `types` list is a catch-all (« Autre ») and seed links
 * it to every leaf in the tree — so it must be linked to these leaves too.
 * Getting that wrong is what leaves a seller with no brand option at all.
 */
export function brandLinksFor(leafKeys: number[]): BrandLinkRow[] {
  const wanted = new Set(leafKeys);
  const links: BrandLinkRow[] = [];
  for (const brand of STRICT_BRANDS) {
    const targets = brand.types.length > 0 ? brand.types : allLeafKeys();
    for (const leaf of targets) {
      if (!wanted.has(leaf)) continue;
      links.push({
        brandId: strictBrandId(brand.n),
        brandName: brand.fr,
        categoryId: strictTypeId(leaf),
        leafKey: leaf,
      });
    }
  }
  return links;
}

/** The brand rows those links need, deduplicated, in seed order. */
export function brandsFor(leafKeys: number[]): BrandRow[] {
  const needed = new Set(brandLinksFor(leafKeys).map((l) => l.brandId));
  return STRICT_BRANDS.filter((b) => needed.has(strictBrandId(b.n))).map((b) => ({
    id: strictBrandId(b.n),
    n: b.n,
    name: b.fr,
    slug: brandSlug(b.fr),
    sortOrder: b.n,
  }));
}

/**
 * Idempotent SQL for the brand rows and their links.
 *
 * `onlyBrands` narrows the BRAND upsert to the brands that do not yet exist in
 * production — an existing brand like « Nestlé » must keep its live name, logo
 * and sortOrder, so the migration adds its missing LINKS without rewriting the
 * row itself. Links are always emitted for every brand the leaves declare.
 */
export function renderBrandSql(leafKeys: number[], onlyBrands: number[]): string {
  const brands = brandsFor(leafKeys).filter((b) => onlyBrands.includes(b.n));
  const links = brandLinksFor(leafKeys);
  if (links.length === 0) return '';

  const parts: string[] = [];

  if (brands.length > 0) {
    parts.push(
      'INSERT INTO "brands" ("id", "name", "slug", "isActive", "sortOrder", "createdAt", "updatedAt")',
      'VALUES',
      brands
        .map(
          (b) =>
            `  (${lit(b.id)}, ${lit(b.name)}, ${lit(b.slug)}, TRUE, ${b.sortOrder}, NOW(), NOW())`,
        )
        .join(',\n'),
      'ON CONFLICT ("id") DO NOTHING;',
      '',
    );
  }

  parts.push(
    'INSERT INTO "brand_categories" ("brandId", "categoryId")',
    'VALUES',
    // The separating comma must come BEFORE the inline comment — after it the
    // `--` swallows the comma and the statement no longer parses.
    links
      .map(
        (l, i) =>
          `  (${lit(l.brandId)}, ${lit(l.categoryId)})${i < links.length - 1 ? ',' : ''}` +
          `  -- ${l.brandName} → ${l.leafKey}`,
      )
      .join('\n'),
    'ON CONFLICT ("brandId", "categoryId") DO NOTHING;',
  );

  return parts.join('\n');
}
