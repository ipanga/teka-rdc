/**
 * `taxonomy:diff` and `taxonomy:apply`.
 *
 *   pnpm --filter api taxonomy:diff              # against .env.development
 *   pnpm --filter api taxonomy:diff:prod         # READ-ONLY against production
 *   pnpm --filter api taxonomy:apply             # writes a migration FILE
 *
 * NEITHER COMMAND WRITES TO A DATABASE.
 *
 *   diff  reads and reports.
 *   apply reads, and emits a reviewable `.sql` file under
 *         prisma/migrations/manual/. It does not execute it, does not add it to
 *         auto-apply.list, and does not connect with write intent.
 *
 * Production changes continue to go through the established route: review the
 * generated file in a pull request, merge it, then dispatch the
 * `Apply prod migration` GitHub Action. That gate is deliberately not
 * bypassable from a laptop — see `--help`.
 *
 * `pnpm db:push`, `prisma db seed` and `db:reset-catalog` are NOT
 * reconciliation mechanisms: the first ignores the canonical source entirely,
 * and the last two begin by deactivating every category and rewriting the whole
 * brand library.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import {
  type DbSnapshot,
  additiveFindings,
  blockingFindings,
  buildReconciliationSql,
  formatDiff,
  taxonomyDiff,
} from './taxonomy-diff';

const prisma = new PrismaClient();

/** READ-ONLY: findMany + groupBy only. No create/update/delete/upsert/raw. */
async function snapshot(): Promise<DbSnapshot> {
  const [categories, attributes, brands, brandLinks, specs] = await Promise.all([
    prisma.category.findMany({
      select: { id: true, name: true, parentCategoryId: true, isActive: true, deletedAt: true },
    }),
    prisma.productAttribute.findMany({ select: { id: true, categoryId: true, name: true } }),
    prisma.brand.findMany({ select: { id: true, name: true, slug: true, isActive: true, deletedAt: true } }),
    prisma.brandCategory.findMany({ select: { brandId: true, categoryId: true } }),
    prisma.productSpecification.groupBy({ by: ['attributeId'], _count: { _all: true } }),
  ]);
  return {
    categories,
    attributes,
    brands,
    brandLinks,
    specificationCounts: new Map(specs.map((s) => [s.attributeId, s._count._all])),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const json = argv.includes('--json');

  if (argv.includes('--help')) {
    console.log(`
taxonomy:diff / taxonomy:apply

  --apply   write a migration FILE for the additive differences (no DB writes)
  --json    machine-readable output, for CI
  --help    this text

Neither command writes to a database. Production reconciliation is:
  1. pnpm --filter api taxonomy:diff:prod      (read-only)
  2. pnpm --filter api taxonomy:apply          (writes a .sql file)
  3. review + merge the file in a pull request
  4. Actions → "Apply prod migration" → the filename

db:push / seed / reset-catalog are NOT reconciliation mechanisms.`);
    return;
  }

  const findings = taxonomyDiff(await snapshot());

  if (json) {
    console.log(JSON.stringify({ findings, counts: {
      additive: additiveFindings(findings).length,
      judgement: blockingFindings(findings).length,
      total: findings.length,
    } }, null, 2));
  } else {
    console.log(formatDiff(findings));
  }

  if (apply) {
    const blocking = blockingFindings(findings);
    if (blocking.length > 0) {
      console.error(
        `\n✗ REFUSING to generate SQL: ${blocking.length} difference(s) need a decision.\n` +
        '  Resolve them in a reviewed migration first. Emitting only the easy half\n' +
        '  would report success while leaving the real problem in place.',
      );
      process.exitCode = 1;
      return;
    }
    const sql = buildReconciliationSql(findings);
    if (!sql) {
      console.log('\n✓ nothing additive to reconcile — no file written.');
      return;
    }
    const name = `${new Date().toISOString().slice(0, 10)}_taxonomy_reconcile.sql`;
    const path = join(__dirname, '../migrations/manual', name);
    writeFileSync(path, sql);
    console.log(`\n✓ wrote prisma/migrations/manual/${name}`);
    console.log('  NOT executed, NOT in auto-apply.list. Review it, merge it, then');
    console.log('  dispatch the "Apply prod migration" Action.');
  }

  // CI signal: additive drift is a failure, because it means production and the
  // source have diverged. JUDGEMENT findings also fail — they need a human.
  if (!apply && (additiveFindings(findings).length > 0 || blockingFindings(findings).length > 0)) {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error('taxonomy tooling failed:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
