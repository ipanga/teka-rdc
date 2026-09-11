/**
 * Taxonomy reconciliation engine — PURE, READ-ONLY, deterministic.
 *
 * WHY THIS EXISTS
 *   `taxonomy-data.ts` declares three relationships per leaf: the category
 *   itself, its characteristics, and its brand links. Only `seed.ts` reads all
 *   three, and `seed.ts` cannot be aimed at production — it opens by
 *   deactivating every category and rewriting the whole brand library. So
 *   production taxonomy changes ship as hand-written SQL, and in September 2026
 *   that produced three separate incidents: six leaves shipped with no
 *   characteristics, the same six shipped with no brands, and a category id
 *   reused with a new meaning stranded 52 attributes and rendered « Type :
 *   Bière » on a whisky.
 *
 *   Each was found by a human reading production afterwards. This module is the
 *   machine that should have found them first.
 *
 * WHAT IT IS NOT
 *   Not a synchroniser. It has no database client, performs no writes, and
 *   produces no destructive SQL. `taxonomy-apply.ts` turns the ADDITIVE subset
 *   of a diff into a reviewable migration file; nothing here or there mutates
 *   anything.
 *
 * THE ADMIN PROBLEM, AND HOW IT IS SETTLED
 *   Categories, characteristics and brand links are editable from the Admin
 *   Dashboard, so a database difference is NOT automatically corruption. The
 *   distinction is drawn on the ID RANGE, which is unambiguous:
 *
 *     13000000-/16000000-/14000000-/15000000-  seeded, deterministic → the
 *       canonical source is authoritative for EXISTENCE.
 *     anything else (RFC4122 uuid)             created through the Admin
 *       Dashboard → the source says nothing about it, and it is reported as
 *       ADMIN, never as drift.
 *
 *   Even on canonical rows, the source is authoritative only for existence.
 *   A renamed, re-parented or deactivated canonical row is reported as
 *   JUDGEMENT, never auto-corrected: an admin renaming « Sodas » is legitimate,
 *   and silently reverting it would be the tool causing the incident.
 */
import { STRICT_BRANDS, STRICT_CATEGORIES } from '../taxonomy-data';
import { renderAttributeSql, renderBrandSql } from './taxonomy-attribute-sql';
import {
  type BrandNode,
  type CategoryNode,
  buildLiveChildIndex,
  findDuplicateBrandIdentities,
  isLiveLeaf,
  normalizeBrandName,
} from '../../src/common/taxonomy/taxonomy-invariants';

export const strictCatId = (n: number) => `13000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const strictTypeId = (n: number) => `16000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const strictAttrId = (n: number) => `14000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const strictBrandId = (n: number) => `15000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

/** Ids the seed owns. Anything else was created through the Admin Dashboard. */
const CANONICAL_PREFIXES = ['13000000-', '16000000-', '14000000-', '15000000-'];
export const isCanonicalId = (id: string) => CANONICAL_PREFIXES.some((p) => id.startsWith(p));

export type Severity =
  /** Additive and safe: `taxonomy:apply` can emit SQL for it. */
  | 'DRIFT_ADDITIVE'
  /** Real difference, but fixing it needs a human decision. Never auto-applied. */
  | 'JUDGEMENT'
  /** Admin-created or Admin-edited. Reported for visibility only. */
  | 'ADMIN'
  /** Soft-deleted or inactive rows kept because data references them. */
  | 'HISTORICAL';

export interface Finding {
  severity: Severity;
  kind: string;
  id?: string;
  label: string;
  detail?: string;
}

export interface DbSnapshot {
  categories: CategoryNode[];
  attributes: { id: string; categoryId: string; name: string }[];
  brands: BrandNode[];
  brandLinks: { brandId: string; categoryId: string }[];
  /** attributeId → number of specifications referencing it (any product state). */
  specificationCounts: Map<string, number>;
}

const CATCH_ALL = 'Autre';

/** Every leaf the canonical source declares, flattened with its parent chain. */
export function canonicalLeaves() {
  return STRICT_CATEGORIES.flatMap((dept) =>
    dept.subs.flatMap((sub) =>
      sub.types.map((t) => ({ ...t, subKey: sub.n, deptKey: dept.n, path: `${dept.fr} > ${sub.fr} > ${t.fr}` })),
    ),
  );
}

/**
 * Compare the canonical source with a database snapshot.
 *
 * Deterministic: findings are sorted by severity then kind then id, so two runs
 * over the same data produce byte-identical output and CI can diff it.
 */
export function taxonomyDiff(db: DbSnapshot): Finding[] {
  const out: Finding[] = [];
  const catById = new Map(db.categories.map((c) => [c.id, c]));
  const liveChildren = buildLiveChildIndex(db.categories);
  const attrById = new Map(db.attributes.map((a) => [a.id, a]));
  const brandById = new Map(db.brands.map((b) => [b.id, b]));
  const linkSet = new Set(db.brandLinks.map((l) => `${l.brandId}|${l.categoryId}`));
  const isLive = (c: CategoryNode) => c.isActive && !c.deletedAt;

  // ── categories ───────────────────────────────────────────────────────────
  const expectedCats = new Map<string, string>();
  for (const dept of STRICT_CATEGORIES) {
    expectedCats.set(strictCatId(dept.n), dept.fr);
    for (const sub of dept.subs) {
      expectedCats.set(strictCatId(sub.n), sub.fr);
      for (const t of sub.types) expectedCats.set(strictTypeId(t.n), t.fr);
    }
  }
  for (const [id, name] of expectedCats) {
    const row = catById.get(id);
    if (!row) {
      out.push({ severity: 'DRIFT_ADDITIVE', kind: 'category.missing', id, label: name });
    } else if (row.name !== name) {
      out.push({
        severity: 'JUDGEMENT', kind: 'category.renamed', id, label: name,
        detail: `source « ${name} », database « ${row.name} » — an Admin rename is legitimate; reverting it is a decision, not a sync`,
      });
    } else if (!isLive(row)) {
      out.push({
        severity: 'JUDGEMENT', kind: 'category.inactive', id, label: name,
        detail: 'declared by the source but deactivated or soft-deleted in the database',
      });
    }
  }
  for (const c of db.categories) {
    if (expectedCats.has(c.id) || !isLive(c)) continue;
    out.push(
      isCanonicalId(c.id)
        ? { severity: 'JUDGEMENT', kind: 'category.unexpected', id: c.id, label: c.name,
            detail: 'canonical id range but absent from the source — a retired node, or an id reused with a new meaning' }
        : { severity: 'ADMIN', kind: 'category.adminCreated', id: c.id, label: c.name,
            detail: 'created through the Admin Dashboard; the canonical source says nothing about it' },
    );
  }

  // ── characteristics ──────────────────────────────────────────────────────
  for (const leaf of canonicalLeaves()) {
    const leafId = strictTypeId(leaf.n);
    (leaf.attrs ?? []).forEach((attr, slot) => {
      const id = strictAttrId(leaf.n * 100 + slot + 1);
      const row = attrById.get(id);
      if (!row) {
        out.push({ severity: 'DRIFT_ADDITIVE', kind: 'attribute.missing', id, label: `${leaf.path} → « ${attr.fr} »` });
      } else if (row.categoryId !== leafId) {
        const owner = catById.get(row.categoryId);
        out.push({
          severity: 'JUDGEMENT', kind: 'attribute.misplaced', id, label: `« ${row.name} »`,
          detail: `declared for ${leaf.path} but attached to « ${owner?.name ?? row.categoryId} »`,
        });
      } else if (row.name !== attr.fr) {
        out.push({
          severity: 'JUDGEMENT', kind: 'attribute.renamed', id, label: `« ${attr.fr} »`,
          detail: `database has « ${row.name} » — may be a legitimate Admin edit`,
        });
      }
    });
  }
  for (const a of db.attributes) {
    const owner = catById.get(a.categoryId);
    if (!owner || !isLive(owner)) continue;
    if (!isLiveLeaf(owner, liveChildren)) {
      const refs = db.specificationCounts.get(a.id) ?? 0;
      out.push({
        severity: refs > 0 ? 'JUDGEMENT' : 'JUDGEMENT',
        kind: 'attribute.onIntermediate', id: a.id, label: `« ${a.name} » on « ${owner.name} »`,
        detail: refs > 0
          ? `${refs} specification(s) reference it — retiring it needs a reviewed migration, never a delete`
          : 'no specification references it; a reviewed migration can retire it',
      });
    }
  }

  // ── brands ───────────────────────────────────────────────────────────────
  for (const b of STRICT_BRANDS) {
    const id = strictBrandId(b.n);
    const row = brandById.get(id);
    if (!row) {
      out.push({ severity: 'DRIFT_ADDITIVE', kind: 'brand.missing', id, label: b.fr });
      continue;
    }
    if (normalizeBrandName(row.name) !== normalizeBrandName(b.fr)) {
      out.push({
        severity: 'JUDGEMENT', kind: 'brand.renamed', id, label: b.fr,
        detail: `database has « ${row.name} » — an Admin rename is legitimate`,
      });
    }
  }
  for (const dup of findDuplicateBrandIdentities(db.brands)) {
    out.push({
      severity: 'JUDGEMENT', kind: `brand.duplicate.${dup.kind}`, label: dup.value,
      detail: `${dup.names.join(' / ')} — merging them is an Admin decision`,
    });
  }

  // ── brand links + catch-all ──────────────────────────────────────────────
  const allLeafKeys = canonicalLeaves().map((l) => l.n);
  for (const b of STRICT_BRANDS) {
    const brandId = strictBrandId(b.n);
    const targets = b.types.length > 0 ? b.types : allLeafKeys;
    for (const leafKey of targets) {
      const categoryId = strictTypeId(leafKey);
      if (!catById.has(categoryId)) continue; // the missing category is already reported
      if (!linkSet.has(`${brandId}|${categoryId}`)) {
        out.push({
          severity: 'DRIFT_ADDITIVE', kind: 'brandLink.missing',
          id: `${brandId}|${categoryId}`, label: `${b.fr} → ${catById.get(categoryId)?.name ?? leafKey}`,
        });
      }
    }
  }
  const catchAll = db.brands.find((b) => normalizeBrandName(b.name) === normalizeBrandName(CATCH_ALL) && b.isActive && !b.deletedAt);
  for (const c of db.categories) {
    if (!isLiveLeaf(c, liveChildren)) continue;
    if (!catchAll || !linkSet.has(`${catchAll.id}|${c.id}`)) {
      out.push({
        severity: isCanonicalId(c.id) ? 'DRIFT_ADDITIVE' : 'ADMIN',
        kind: 'catchAll.missing', id: c.id, label: c.name,
        detail: isCanonicalId(c.id)
          ? 'a live leaf must always offer « Autre »'
          : 'Admin-created leaf with no « Autre » — link it from the Admin Dashboard',
      });
    }
  }

  // ── historical rows worth stating explicitly ─────────────────────────────
  const referencedHistorical = db.attributes.filter((a) => {
    const owner = catById.get(a.categoryId);
    return owner && !isLive(owner) && (db.specificationCounts.get(a.id) ?? 0) > 0;
  });
  if (referencedHistorical.length > 0) {
    out.push({
      severity: 'HISTORICAL', kind: 'attribute.referencedHistorical',
      label: `${referencedHistorical.length} characteristic(s) on retired categories`,
      detail: 'referenced by specifications on soft-deleted products — keep them; deleting orphans real history',
    });
  }

  const order: Record<Severity, number> = { DRIFT_ADDITIVE: 0, JUDGEMENT: 1, ADMIN: 2, HISTORICAL: 3 };
  return out.sort(
    (a, b) => order[a.severity] - order[b.severity] || a.kind.localeCompare(b.kind) || (a.id ?? '').localeCompare(b.id ?? ''),
  );
}

/** Deterministic, human-readable report. */
export function formatDiff(findings: Finding[]): string {
  if (findings.length === 0) return '✓ taxonomy matches the canonical source — no differences.';
  const lines: string[] = [];
  const bySeverity = new Map<Severity, Finding[]>();
  for (const f of findings) bySeverity.set(f.severity, [...(bySeverity.get(f.severity) ?? []), f]);

  const title: Record<Severity, string> = {
    DRIFT_ADDITIVE: 'ADDITIVE DRIFT — safe to reconcile with generated SQL',
    JUDGEMENT: 'NEEDS A DECISION — never auto-applied',
    ADMIN: 'ADMIN-MANAGED — reported for visibility, not drift',
    HISTORICAL: 'HISTORICAL — intentionally preserved',
  };
  for (const sev of ['DRIFT_ADDITIVE', 'JUDGEMENT', 'ADMIN', 'HISTORICAL'] as Severity[]) {
    const group = bySeverity.get(sev);
    if (!group?.length) continue;
    lines.push(`\n══ ${title[sev]} — ${group.length} ══`);
    for (const f of group) {
      lines.push(`  [${f.kind}] ${f.label}${f.id ? `  (${f.id})` : ''}`);
      if (f.detail) lines.push(`      ${f.detail}`);
    }
  }
  return lines.join('\n');
}

export const additiveFindings = (f: Finding[]) => f.filter((x) => x.severity === 'DRIFT_ADDITIVE');
export const blockingFindings = (f: Finding[]) => f.filter((x) => x.severity === 'JUDGEMENT');

/**
 * Turn the ADDITIVE findings into a migration file.
 *
 * Refuses outright when anything needs a decision. A tool that quietly skips
 * the hard half of a diff and reports success is worse than no tool: the
 * operator would believe the taxonomy was reconciled.
 */
export function buildReconciliationSql(findings: Finding[]): string | null {
  const additive = additiveFindings(findings);
  if (additive.length === 0) return null;

  const leafKeys = new Set<number>();
  const brandKeys = new Set<number>();
  for (const f of additive) {
    if (f.kind === 'attribute.missing' && f.id) leafKeys.add(Math.floor(Number(f.id.slice(-12)) / 100));
    if (f.kind === 'brand.missing' && f.id) brandKeys.add(Number(f.id.slice(-12)));
    if (f.kind === 'brandLink.missing' && f.id) {
      const [brandId, categoryId] = f.id.split('|');
      brandKeys.add(Number(brandId.slice(-12)));
      leafKeys.add(Number(categoryId.slice(-12)));
    }
    if (f.kind === 'catchAll.missing' && f.id) leafKeys.add(Number(f.id.slice(-12)));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const parts = [
    `-- Taxonomy reconciliation (${stamp}) — GENERATED by \`pnpm taxonomy:apply\`.`,
    '--',
    '-- Additive only. Every statement is INSERT … ON CONFLICT DO NOTHING or',
    '-- DO UPDATE onto a deterministic id, so re-running changes nothing and a',
    '-- row that already exists keeps its live values.',
    '--',
    '-- REVIEW THIS FILE BEFORE MERGING. It is not added to auto-apply.list and',
    '-- has not been executed. Production goes through the `Apply prod migration`',
    '-- GitHub Action, after this file is merged.',
    '--',
    `-- Reconciles ${additive.length} additive difference(s):`,
    ...additive.map((f) => `--   [${f.kind}] ${f.label}`),
    '',
  ];

  const leaves = [...leafKeys].filter((n) => n > 9999).sort((a, b) => a - b);
  if (leaves.length > 0) {
    const attrSql = renderAttributeSql(leaves);
    if (attrSql) parts.push('-- ── characteristics ──', attrSql, '');
    const brandSql = renderBrandSql(leaves, [...brandKeys].sort((a, b) => a - b));
    if (brandSql) parts.push('-- ── brands + links ──', brandSql, '');
  }
  return parts.join('\n');
}
