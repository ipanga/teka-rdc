import { OrderStatus } from '@prisma/client';

/**
 * Days a buyer has to request a return after delivery — and, equivalently, the
 * hold before a seller's earning for that order becomes payout-eligible.
 * Evaluated lazily on read (no cron): an earning is eligible once
 * `order.deliveredAt + RETURN_WINDOW_DAYS <= now` and the order is not RETURNED.
 */
export const RETURN_WINDOW_DAYS = 2;

/**
 * Canonical order-status transitions for the Teka-managed lifecycle.
 *
 *   PENDING → CONFIRMED → PROCESSING → READY_FOR_TEKA_PICKUP   (seller drives)
 *   READY_FOR_TEKA_PICKUP → RECEIVED_AT_TEKA → OUT_FOR_DELIVERY → DELIVERED   (Teka/admin drives)
 *   DELIVERED → RETURNED   (admin approves a return)
 *
 * `SHIPPED` is legacy (no longer produced) — kept here so any in-flight order
 * created under the old seller-driven flow can still be completed by admin.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [
    OrderStatus.READY_FOR_TEKA_PICKUP,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.READY_FOR_TEKA_PICKUP]: [
    OrderStatus.RECEIVED_AT_TEKA,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.RECEIVED_AT_TEKA]: [
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
  [OrderStatus.SHIPPED]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [OrderStatus.RETURNED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.RETURNED]: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Statuses from which a BUYER may self-cancel — i.e. before the parcel leaves
 * the seller for Teka custody. Once READY_FOR_TEKA_PICKUP or later, only admin
 * can cancel (the goods are in the logistics chain).
 */
export const BUYER_CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
];

/**
 * Whether a return can still be requested for an order delivered at
 * `deliveredAt`, evaluated at `now`. Returns false if never delivered.
 */
export function isWithinReturnWindow(
  deliveredAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!deliveredAt) return false;
  const deadline = new Date(deliveredAt);
  deadline.setDate(deadline.getDate() + RETURN_WINDOW_DAYS);
  return now <= deadline;
}
