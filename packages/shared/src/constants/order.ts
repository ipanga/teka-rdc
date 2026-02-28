export const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED'] as const;
export const PAYMENT_METHODS = ['MOBILE_MONEY', 'COD'] as const;
export const PAYMENT_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'] as const;

export const ORDER_NUMBER_PREFIX = 'TK';

/** Valid state transitions: key = current status, value = allowed next statuses */
export const ORDER_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

/** Statuses considered "active" (order is in progress) */
export const ACTIVE_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY'] as const;

/** Statuses considered "terminal" (order flow is complete) */
export const TERMINAL_ORDER_STATUSES = ['DELIVERED', 'CANCELLED', 'RETURNED'] as const;
