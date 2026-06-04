import posthog from 'posthog-js';

/**
 * Typed client-side event tracking for buyer-web.
 *
 * These are the **buyer-owned** UI-intent events from the Event Ownership
 * Matrix (tasks/posthog-rollout-progress.md). The API owns the
 * authoritative transactional events (order_*, payment_*, auth) — never
 * emit those from the client, to avoid double-counting.
 *
 * `posthog.capture` is gated on `__loaded` so every call is a safe no-op
 * when PostHog isn't initialized (empty key in dev), mirroring the
 * provider. `before_send: scrubPosthogEvent` strips phone numbers from
 * properties as defence-in-depth.
 */
export type BuyerAnalyticsEvents = {
  product_viewed: {
    productId: string;
    categoryId?: string;
    price_cdf?: number;
    sellerId?: string;
  };
  category_viewed: { categoryId: string; slug?: string };
  search_performed: { query: string; result_count: number };
  add_to_cart: { productId: string; quantity: number };
  remove_from_cart: { productId: string };
  checkout_started: { item_count: number; cart_value_cdf: number };
  wishlist_added: { productId: string };
  wishlist_removed: { productId: string };
};

export function track<E extends keyof BuyerAnalyticsEvents>(
  event: E,
  properties: BuyerAnalyticsEvents[E],
): void {
  if (typeof window === 'undefined') return;
  // No-op until PostHog is initialized (empty key in dev) — same gate the
  // provider uses for identify/reset.
  if (!posthog.__loaded) return;
  posthog.capture(event, properties);
}
