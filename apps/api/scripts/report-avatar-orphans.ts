/**
 * READ-ONLY report: Cloudinary avatar assets (`teka-rdc/avatars/`) that no
 * user row references. Prints counts only — it never deletes anything, and
 * deleting on this report alone would be wrong anyway: dev and prod share the
 * same Cloudinary cloud, so an asset unreferenced by THIS database may be a
 * live avatar of the other environment. Run against each environment's
 * DATABASE_URL and intersect before any cleanup (D11 follow-up).
 *
 *   pnpm exec tsx --env-file=../../.env.development scripts/report-avatar-orphans.ts
 */
import { v2 as cloudinary } from 'cloudinary';
import { PrismaClient } from '@prisma/client';
import { AVATAR_FOLDER, avatarPublicIdFromUrl } from '../src/users/avatar-asset';

async function main() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  cloudinary.config({
    cloud_name: cloudName,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const assets = new Map<string, number>();
  let cursor: string | undefined;
  do {
    const page = (await cloudinary.api.resources({
      type: 'upload',
      prefix: `${AVATAR_FOLDER}/`,
      max_results: 500,
      next_cursor: cursor,
    })) as { resources: { public_id: string; bytes?: number }[]; next_cursor?: string };
    for (const r of page.resources) assets.set(r.public_id, r.bytes ?? 0);
    cursor = page.next_cursor;
  } while (cursor);

  const prisma = new PrismaClient();
  const rows = await prisma.user.findMany({
    where: { avatar: { not: null } },
    select: { avatar: true },
  });
  await prisma.$disconnect();

  const referenced = new Set<string>();
  let unrecognised = 0;
  for (const { avatar } of rows) {
    const id = avatarPublicIdFromUrl(avatar, cloudName);
    if (id) referenced.add(id);
    else unrecognised++;
  }
  const orphans = [...assets.keys()].filter((id) => !referenced.has(id));
  const orphanBytes = orphans.reduce((n, id) => n + (assets.get(id) ?? 0), 0);

  console.log(
    JSON.stringify(
      {
        assetsInFolder: assets.size,
        referencedByThisDb: referenced.size,
        avatarRowsNotOurAssets: unrecognised,
        unreferencedByThisDb: orphans.length,
        unreferencedBytes: orphanBytes,
        note: 'read-only; nothing deleted; intersect across environments before any cleanup',
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
