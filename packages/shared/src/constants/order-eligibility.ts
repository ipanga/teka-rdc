/**
 * Order action eligibility for the CLIENTS (buyer-web, admin-web; the Flutter
 * apps mirror it) — which buttons to offer. The API stays authoritative and
 * re-checks everything on the locked order row
 * (`apps/api/src/orders/order-inventory.ts`); this only avoids offering an
 * action that is certain to be refused. `order-inventory.spec.ts` in the API
 * fails if these lists drift from the server's.
 */

/** Buyer self-cancel: before the parcel enters Teka custody. */
export const BUYER_CANCELLABLE_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING'] as const;

/** Admin cancel (and forced CANCELLED): every pre-delivery status. */
export const ADMIN_CANCELLABLE_ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'READY_FOR_TEKA_PICKUP',
  'RECEIVED_AT_TEKA',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
] as const;

/** Final statuses: their stock was released; nothing may leave them. */
export const STOCK_RELEASED_ORDER_STATUSES = ['CANCELLED', 'RETURNED'] as const;

/** Cash collected or refunded: such an order can never be cancelled. */
export const CANCELLATION_BLOCKING_PAYMENT_STATUSES = ['COMPLETED', 'REFUNDED'] as const;

interface EligibilityInput {
  status: string;
  paymentStatus?: string | null;
}

const includes = (list: readonly string[], value: string | null | undefined) =>
  value != null && list.includes(value);

function unpaid(order: EligibilityInput): boolean {
  return !includes(CANCELLATION_BLOCKING_PAYMENT_STATUSES, order.paymentStatus);
}

export function canBuyerCancelOrder(order: EligibilityInput): boolean {
  return includes(BUYER_CANCELLABLE_ORDER_STATUSES, order.status) && unpaid(order);
}

/** A seller rejects only a new (PENDING), unpaid order. */
export function canSellerRejectOrder(order: EligibilityInput): boolean {
  return order.status === 'PENDING' && unpaid(order);
}

export function canAdminCancelOrder(order: EligibilityInput): boolean {
  return includes(ADMIN_CANCELLABLE_ORDER_STATUSES, order.status) && unpaid(order);
}

/**
 * Targets the admin force-status tool can actually apply to this order:
 * none from a final status, CANCELLED only when an admin cancel is allowed,
 * RETURNED only from DELIVERED, never the current status.
 */
export function adminForceStatusTargets<T extends string>(
  order: EligibilityInput,
  all: readonly T[],
): T[] {
  if (includes(STOCK_RELEASED_ORDER_STATUSES, order.status)) return [];
  return all.filter((target) => {
    if (target === order.status) return false;
    if (target === 'CANCELLED') return canAdminCancelOrder(order);
    if (target === 'RETURNED') return order.status === 'DELIVERED';
    return true;
  });
}
