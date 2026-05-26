/**
 * Dev helper — sets a known bcrypt password on an ADMIN user so the
 * local admin-web can be logged into for smoke testing. Never used
 * in prod (the script refuses if NODE_ENV=production).
 *
 * Lookup order:
 *   1. ADMIN with email = SMOKE_ADMIN_EMAIL (defaults to contact@teka.cd,
 *      which is what `pnpm db:seed` produces).
 *   2. If none match, the oldest ADMIN row by createdAt (covers dev DBs
 *      that were seeded with a different email override).
 *   3. If no ADMIN exists at all, the script aborts and tells you to seed.
 *
 * Usage from repo root:
 *   DATABASE_URL=$(grep '^DATABASE_URL=' .env.development | cut -d= -f2-) \
 *     pnpm --filter api exec tsx scripts/set-temp-admin-password.ts
 *
 *   # null the password back out when smoke is done:
 *   DATABASE_URL=... pnpm --filter api exec tsx \
 *     scripts/set-temp-admin-password.ts --clear
 *
 * Optional overrides:
 *   SMOKE_ADMIN_EMAIL=admin@teka.cd
 *   SMOKE_ADMIN_PASSWORD=MyChoice2026!
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const TARGET_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'contact@teka.cd';
const TEMP_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? 'TestSmoke2026!';
const CLEAR = process.argv.includes('--clear');

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run with NODE_ENV=production.');
  }
  const prisma = new PrismaClient();
  try {
    let admin = await prisma.user.findFirst({
      where: { email: TARGET_EMAIL, role: 'ADMIN' },
    });
    let fallbackUsed = false;
    if (!admin) {
      admin = await prisma.user.findFirst({
        where: { role: 'ADMIN', deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      fallbackUsed = !!admin;
    }
    if (!admin) {
      throw new Error(
        'No ADMIN user found. Run `pnpm db:seed` first (or seed one ' +
          'out-of-band per docs/deployment.md § 5b).',
      );
    }
    if (fallbackUsed) {
      console.warn(
        `No admin with email=${TARGET_EMAIL}; falling back to oldest ` +
          `ADMIN row (email=${admin.email}).`,
      );
    }
    if (CLEAR) {
      await prisma.user.update({
        where: { id: admin.id },
        data: { passwordHash: null, passwordSetAt: null },
      });
      console.log(`Cleared password on admin id=${admin.id} (${admin.email})`);
    } else {
      const hash = await bcrypt.hash(TEMP_PASSWORD, 12);
      await prisma.user.update({
        where: { id: admin.id },
        data: {
          passwordHash: hash,
          passwordSetAt: new Date(),
          authProvider: 'EMAIL_PASSWORD',
        },
      });
      console.log(
        `Set temp password on admin id=${admin.id} (${admin.email}). ` +
          `Login with: email=${admin.email} password=${TEMP_PASSWORD}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
