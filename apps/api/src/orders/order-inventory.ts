import { Logger } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';

/**
 * Inventory lifecycle of an order — the single place that decides whether an
 * order's checkout stock hold is (still) to be released.
 *
 * Model (no extra column; proven from the existing audit log):
 *
 *  - `CheckoutService.checkout()` deducts every line from `Product.quantity`
 *    with a conditional decrement in the order-creation transaction.
 *  - The hold is released (stock incremented back) ONLY on the order's FIRST
 *    entry into a stock-releasing status (CANCELLED or RETURNED), whatever the
 *    path: buyer cancel, seller reject, admin cancel, forced CANCELLED/RETURNED,
 *    approved return.
 *  - Every release, past and present, is written in the same transaction as an
 *    `OrderStatusLog` row INTO CANCELLED or RETURNED. So "the order already has
 *    such a log" ⇒ "the hold may already have been released" — and we never
 *    release twice. The converse is not provable for legacy rows (a forced
 *    CANCELLED before 2026-10 wrote the log WITHOUT restocking): those are left
 *    alone rather than restocked on a guess — see
 *    `prisma/reports/inventory-hold-candidates.sql`.
 *  - CANCELLED and RETURNED are absorbing: no path (forced included) moves an
 *    order out of them, so a released order can never look "held" again.
 *
 * Concurrency: every status transition (cancellation, fulfillment, forced,
 * return) first takes the order's row lock with `lockOrderForUpdate`, then
 * RE-VALIDATES against the row it just locked, then writes. Under PostgreSQL
 * READ COMMITTED a competing transaction blocks on `SELECT … FOR UPDATE` until
 * the winner commits, and its next statement sees the winner's row — so the
 * loser re-validates against e.g. CANCELLED and fails with the same French
 * error a sequential retry gets. The pre-transaction read each service keeps
 * is only a fast path; it is never trusted for the decision. The history
 * check below therefore always runs under that lock.
 */

/** Prisma interactive-transaction client. */
export type Tx = Prisma.TransactionClient;

/** Statuses whose first entry releases the checkout stock hold. */
export const STOCK_RELEASED_STATUSES: OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.RETURNED,
];

/**
 * Payment states that forbid a cancellation: money was collected (COMPLETED)
 * or already given back (REFUNDED). A cancelled order must never hide cash.
 */
export const CANCELLATION_BLOCKING_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.COMPLETED,
  PaymentStatus.REFUNDED,
];

/**
 * Statuses an ADMIN may cancel from (dedicated cancel and forced CANCELLED):
 * everything before delivery, including OUT_FOR_DELIVERY / legacy SHIPPED (a
 * parcel refused at the door comes back to Teka). Never DELIVERED (use the
 * return flow), never CANCELLED/RETURNED (already released).
 */
export const ADMIN_CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.READY_FOR_TEKA_PICKUP,
  OrderStatus.RECEIVED_AT_TEKA,
  OrderStatus.SHIPPED,
  OrderStatus.OUT_FOR_DELIVERY,
];

export function isStockReleasedStatus(status: OrderStatus): boolean {
  return STOCK_RELEASED_STATUSES.includes(status);
}

export function isPaymentBlockingCancellation(status: PaymentStatus): boolean {
  return CANCELLATION_BLOCKING_PAYMENT_STATUSES.includes(status);
}

/**
 * Locks the order row for the rest of the transaction (`SELECT … FOR UPDATE`)
 * and returns its CURRENT state, or null when it does not exist / is soft
 * deleted. Every status transition calls this first and validates the result.
 */
export async function lockOrderForUpdate(tx: Tx, orderId: string) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "orders"
    WHERE "id" = ${orderId}::uuid AND "deletedAt" IS NULL
    FOR UPDATE`;
  if (locked.length === 0) return null;
  return tx.order.findUnique({ where: { id: orderId } });
}

const logger = new Logger('OrderInventory');

/**
 * Releases the order's checkout stock hold, at most once in its lifetime.
 *
 * MUST be called inside the transaction that holds the order's row lock
 * (`lockOrderForUpdate`) and is moving it into CANCELLED/RETURNED, BEFORE that
 * move's own status log is written — otherwise the log it is about to write
 * would count as a prior release.
 *
 * Lines are aggregated per product and incremented in productId order, the
 * same order checkout locks them in, so a release can never deadlock against
 * a concurrent checkout of the same products.
 */
export async function releaseOrderStockHold(
  tx: Tx,
  orderId: string,
): Promise<{ released: boolean }> {
  const priorRelease = await tx.orderStatusLog.count({
    where: { orderId, toStatus: { in: STOCK_RELEASED_STATUSES } },
  });
  if (priorRelease > 0) {
    // Already released by an earlier CANCELLED/RETURNED entry — or a legacy
    // forced transition that may not have restocked. Either way: no guess.
    logger.warn(
      `Stock non restauré pour la commande ${orderId} : une libération antérieure figure déjà dans l'historique`,
    );
    return { released: false };
  }

  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { productId: true, quantity: true },
  });
  const byProduct = new Map<string, number>();
  for (const it of items) {
    byProduct.set(
      it.productId,
      (byProduct.get(it.productId) ?? 0) + it.quantity,
    );
  }
  for (const productId of [...byProduct.keys()].sort()) {
    await tx.product.update({
      where: { id: productId },
      data: { quantity: { increment: byProduct.get(productId)! } },
    });
  }
  return { released: true };
}
