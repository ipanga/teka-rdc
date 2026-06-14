/**
 * Pre-launch catalog reset — CLI operator tool (deliberate action, like the seed).
 *
 * Wipes every product NOT referenced by an order line (order history is kept),
 * cascading product images / specifications / reviews / wishlists / cart items
 * and detaching promotions, then purges the corresponding Cloudinary assets.
 * Irreversible. There is no HTTP endpoint for this.
 *
 *   pnpm db:reset-catalog                 # DRY RUN — prints what would be deleted
 *   pnpm db:reset-catalog -- --confirm    # executes the irreversible reset
 *   pnpm db:reset-catalog -- --dry-run    # explicit dry run (same as no flag)
 *
 * Runs the SAME unit-tested CatalogResetService logic as production, but wired
 * by hand instead of through the Nest container: tsx/esbuild doesn't emit the
 * decorator metadata Nest DI relies on (same reason `seed.ts` uses a raw
 * PrismaClient). We pass a real PrismaClient plus the real CloudinaryService
 * (constructed with a minimal env-backed config shim) — so the Cloudinary
 * delete path is the exact production code.
 */
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from '../src/cloudinary/cloudinary.service';
import { CatalogResetService } from '../src/admin/catalog-reset.service';

async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--confirm');
  const dryRun = !confirmed; // anything without --confirm is a dry run

  const prisma = new PrismaClient();
  // Minimal ConfigService shim reading process.env (populated by --env-file).
  const configShim = {
    get: <T = string>(key: string): T => process.env[key] as unknown as T,
  } as unknown as ConfigService;
  const cloudinary = new CloudinaryService(configShim);
  const service = new CatalogResetService(prisma as never, cloudinary);

  try {
    const report = await service.resetCatalog({ dryRun });

    if (dryRun) {
      console.log('\n=== CATALOG RESET — DRY RUN (no changes made) ===');
      console.log(JSON.stringify(report, null, 2));
      console.log(
        '\nRe-run with `-- --confirm` to execute the IRREVERSIBLE reset ' +
          '(deletes products + Cloudinary assets).\n',
      );
    } else {
      console.log('\n=== CATALOG RESET — DONE ===');
      console.log(JSON.stringify(report, null, 2));
      console.log('');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Catalog reset failed:', err);
  process.exit(1);
});
