/**
 * One-off, idempotent backfill for the buyer Notification Center.
 *
 * Buyer order-lifecycle events historically fired push/email only and never
 * wrote a `UserNotification` feed row (fixed forward in
 * order-notification.service.ts). This script reconstructs the ONE event we can
 * derive safely from persisted data — "commande enregistrée" — for every
 * existing order, so buyers see their order history in the feed. It does NOT
 * try to reconstruct intermediate pushes (confirmed/shipped/…): those were
 * never stored and cannot be recovered reliably from the device.
 *
 * SAFE + idempotent: creates a row only when no ORDER-type feed row already
 * exists for that (buyer, order). Re-running is a no-op.
 *
 * Run:
 *   pnpm --filter api exec tsx --env-file=../../.env.development \
 *     prisma/backfill-buyer-order-notifications.ts
 *   (use .env.production for prod; add --confirm to actually write)
 */
import { PrismaClient, UserNotificationType } from '@prisma/client';

const prisma = new PrismaClient();

const CONFIRM = process.argv.includes('--confirm');
const BATCH = 500;

function formatCDF(value: bigint | number | null | undefined): string {
  if (value == null) return '0';
  const n = typeof value === 'bigint' ? Number(value) : value;
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)).replace(/\s/g, '.');
}

async function main() {
  console.log(
    `Backfill buyer order-notification feed rows${CONFIRM ? '' : ' (DRY-RUN — pass --confirm to write)'}`,
  );

  let cursor: string | undefined;
  let scanned = 0;
  let created = 0;
  let skipped = 0;

  for (;;) {
    const orders = await prisma.order.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        orderNumber: true,
        buyerId: true,
        totalCDF: true,
        createdAt: true,
      },
    });
    if (orders.length === 0) break;
    cursor = orders[orders.length - 1].id;

    for (const order of orders) {
      scanned++;
      if (!order.buyerId) {
        skipped++;
        continue;
      }

      const existing = await prisma.userNotification.findFirst({
        where: {
          userId: order.buyerId,
          type: UserNotificationType.ORDER,
          entityType: 'order',
          entityId: order.id,
        },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      if (CONFIRM) {
        await prisma.userNotification.create({
          data: {
            userId: order.buyerId,
            type: UserNotificationType.ORDER,
            title: 'Commande enregistrée',
            body: `Commande ${order.orderNumber} — ${formatCDF(order.totalCDF)} FC.`,
            entityType: 'order',
            entityId: order.id,
            // Anchor the feed row to when the order was actually placed so it
            // sorts correctly in the newest-first feed.
            createdAt: order.createdAt,
          },
        });
      }
      created++;
    }
  }

  console.log(
    `Done. Scanned ${scanned} orders — ${created} feed row(s) ${CONFIRM ? 'created' : 'to create'}, ${skipped} skipped (already present / no buyer).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
