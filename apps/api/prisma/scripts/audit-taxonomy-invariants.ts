/**
 * READ-ONLY taxonomy invariant audit.
 *
 * STRICTLY NON-MUTATING — findMany only. No create/update/delete/upsert/raw.
 *
 * Runs the structural invariants from `src/common/taxonomy/taxonomy-invariants.ts`
 * against a real database. The same functions are unit-tested in CI with
 * fixtures; this is how they get applied to production, where the data lives.
 *
 * Run (read-only):
 *   cd apps/api && npx tsx --env-file=../../.env.production \
 *     prisma/scripts/audit-taxonomy-invariants.ts
 *
 * Exit code 1 when an invariant is violated outside its documented allowlist,
 * so it can gate an operator action if ever wanted. Prints no PII: only
 * category names, attribute names, shortCodes and ids.
 */
import { PrismaClient } from '@prisma/client';
import {
  P3_FOREIGN_SPECIFICATION_ALLOWLIST,
  findForeignActiveSpecifications,
  findIntermediateAttributeViolations,
} from '../../src/common/taxonomy/taxonomy-invariants';

const prisma = new PrismaClient();

/**
 * Categories with a documented exception to invariant 1.
 *
 * EMPTY BY DESIGN. The 52 known violations are legacy residue from the
 * 2026-06-24 id reuse and are being deactivated by the P2 remediation rather
 * than excused — see docs/pre-scale-readiness.md. Add an id here only with a
 * written justification, never to silence a finding.
 */
const INTERMEDIATE_ATTRIBUTE_ALLOWLIST: ReadonlySet<string> = new Set();

async function main() {
  const [categories, attributes, products, specifications] = await Promise.all([
    prisma.category.findMany({
      select: { id: true, name: true, parentCategoryId: true, isActive: true, deletedAt: true },
    }),
    prisma.productAttribute.findMany({ select: { id: true, categoryId: true, name: true } }),
    prisma.product.findMany({
      select: { id: true, shortCode: true, categoryId: true, status: true, deletedAt: true },
    }),
    prisma.productSpecification.findMany({
      select: { id: true, productId: true, attributeId: true },
    }),
  ]);

  const byId = new Map(categories.map((c) => [c.id, c]));
  const path = (id: string) => {
    const parts: string[] = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 6) {
      parts.unshift(cur.name);
      cur = cur.parentCategoryId ? byId.get(cur.parentCategoryId) : undefined;
    }
    return parts.join(' > ');
  };

  const intermediate = findIntermediateAttributeViolations(
    categories,
    attributes,
    INTERMEDIATE_ATTRIBUTE_ALLOWLIST,
  );
  const foreign = findForeignActiveSpecifications(
    products,
    attributes,
    specifications,
    P3_FOREIGN_SPECIFICATION_ALLOWLIST,
  );

  console.log('══ INVARIANT 1 — characteristics belong to live leaves ══');
  console.log(`  violations: ${intermediate.length}`);
  for (const v of intermediate) {
    console.log(`    « ${v.attributeName} » on ${path(v.categoryId)}  (attr ...${v.attributeId.slice(-12)})`);
  }

  console.log('\n══ INVARIANT 2 — no foreign characteristic on an ACTIVE product ══');
  console.log(`  violations outside the documented P3 allowlist: ${foreign.length}`);
  for (const v of foreign) {
    console.log(`    ${v.shortCode}  spec ...${v.specificationId.slice(-12)} — attribute owned by ${path(v.attributeCategoryId)}`);
  }
  console.log(`  (allowlisted P3 residuals: ${P3_FOREIGN_SPECIFICATION_ALLOWLIST.size})`);

  const failed = intermediate.length + foreign.length;
  console.log(`\n${failed === 0 ? '✓ all invariants hold' : `✗ ${failed} violation(s)`}`);
  await prisma.$disconnect();
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error('AUDIT FAILED', e);
  await prisma.$disconnect();
  process.exit(1);
});
