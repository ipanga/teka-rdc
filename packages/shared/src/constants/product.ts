export const PRODUCT_CONDITIONS = ['NEW', 'USED'] as const;
export const PRODUCT_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'ARCHIVED'] as const;
export const ATTRIBUTE_TYPES = ['TEXT', 'SELECT', 'MULTISELECT', 'NUMERIC'] as const;
export const MAX_PRODUCT_IMAGES = 8;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const BROWSE_DEFAULT_LIMIT = 20;
export const BROWSE_MAX_LIMIT = 100;

// === Public stock availability ==========================================
//
// Buyers never see an exact remaining quantity — only a coarse state. The
// number stays internal, where it is still authoritative for cart limits,
// checkout validation, overselling prevention and seller inventory.
//
// TODO(stock-status-server-owned): this threshold is a CLIENT-side rule and
// therefore has to be duplicated per platform (this constant for the three
// Next.js apps, a mirrored Dart constant for buyer-mobile — the two languages
// cannot share one literal). The single source of truth should eventually be
// the API: have the product payload carry a `stockStatus` field derived
// server-side, and delete both copies. That is an API contract change, so it
// is deliberately not done here.
//
// The value (5) is the pre-existing rule this replaces: it was hardcoded in
// buyer-web's product-card.tsx and product-detail-page.tsx and mirrored by
// buyer-mobile's isLowStock. It is centralised, not invented.
export const LOW_STOCK_THRESHOLD = 5;

/** Coarse, publicly displayable stock state. Never carries a quantity. */
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

/**
 * Maps an internal quantity to the state buyers are allowed to see.
 * `quantity` is never surfaced to the UI — only the returned status is.
 */
export function stockStatus(quantity: number | null | undefined): StockStatus {
  const q = quantity ?? 0;
  if (q <= 0) return 'out_of_stock';
  if (q <= LOW_STOCK_THRESHOLD) return 'low_stock';
  return 'in_stock';
}

/** French label for a stock state. The only stock copy buyers should see. */
export function stockStatusLabel(status: StockStatus): string {
  switch (status) {
    case 'out_of_stock':
      return 'Rupture de stock';
    case 'low_stock':
      return 'Stock limité';
    case 'in_stock':
      return 'En stock';
  }
}
