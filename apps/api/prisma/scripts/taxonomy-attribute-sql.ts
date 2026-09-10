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
import { STRICT_CATEGORIES, type AttrTpl } from '../taxonomy-data';

/** Deterministic id ranges — identical to `seed.ts`. */
export const strictTypeId = (n: number) =>
  `16000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const strictAttrId = (n: number) =>
  `14000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

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
