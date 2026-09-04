/**
 * Dev helper — sets a known bcrypt password on a SELLER user so the local
 * seller-web (or a curl login) can exercise seller flows in smoke tests.
 * Never used in prod (refuses if NODE_ENV=production). Mirrors
 * set-temp-admin-password.ts.
 *
 * Usage from repo root:
 *   DATABASE_URL=$(grep '^DATABASE_URL=' .env.development | cut -d= -f2-) \
 *     SMOKE_SELLER_EMAIL=marie@example.cd \
 *     pnpm --filter api exec tsx scripts/set-temp-seller-password.ts
 *   # …and afterwards:
 *   DATABASE_URL=... SMOKE_SELLER_EMAIL=... pnpm --filter api exec tsx \
 *     scripts/set-temp-seller-password.ts --clear
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const TARGET_EMAIL = process.env.SMOKE_SELLER_EMAIL;
const TEMP_PASSWORD = process.env.SMOKE_SELLER_PASSWORD ?? 'TestSmoke2026!';
const CLEAR = process.argv.includes('--clear');

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run against production');
  }
  if (!TARGET_EMAIL) {
    throw new Error('SMOKE_SELLER_EMAIL is required');
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: { email: TARGET_EMAIL, role: 'SELLER' },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!user) throw new Error(`No SELLER with email=${TARGET_EMAIL}`);
    if (CLEAR) {
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: null } });
      console.log(`Cleared password on seller id=${user.id} (${user.email})`);
      return;
    }
    if (user.passwordHash) {
      throw new Error(
        `Seller ${user.email} already has a password — refusing to overwrite a real credential`,
      );
    }
    const hash = await bcrypt.hash(TEMP_PASSWORD, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, authProvider: 'EMAIL_PASSWORD', emailVerified: true },
    });
    console.log(
      `Set temp password on seller id=${user.id} (${user.email}). Password: see $SMOKE_SELLER_PASSWORD or the default in this file.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
