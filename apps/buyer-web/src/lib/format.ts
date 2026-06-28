import { formatFC, groupThousands } from '@teka/shared';

/**
 * Format a BigInt string (centimes) as Congolese-Franc currency.
 * The user-facing label is **FC** with '.' thousand separators (DRC
 * convention): "150000" (centimes) -> "1.500 FC". Delegates to the shared
 * formatter so web + mobile stay identical.
 */
export function formatCDF(centimes: string): string {
  return formatFC(centimes);
}

/**
 * Discount percentage from regular + promotional centimes strings:
 * round((price − discount) / price × 100). Returns 0 when there is no valid
 * promotion (the API enforces 0 < discount < price, so this is just defensive).
 */
export function discountPercent(
  priceCDF: string,
  discountPriceCDF?: string | null,
): number {
  if (!discountPriceCDF) return 0;
  const price = Number(priceCDF);
  const discount = Number(discountPriceCDF);
  if (!(discount > 0 && discount < price)) return 0;
  return Math.round(((price - discount) / price) * 100);
}

/**
 * The effective (charged) centimes for a product: the promotional price when a
 * valid one is set, else the regular price. Mirrors the API's effectivePrice.
 */
export function effectiveCentimes(p: {
  priceCDF: string;
  discountPriceCDF?: string | null;
}): string {
  return p.discountPriceCDF != null &&
    Number(p.discountPriceCDF) < Number(p.priceCDF)
    ? p.discountPriceCDF
    : p.priceCDF;
}

/**
 * Format a USD amount (already in dollars) French-style: '.' thousands,
 * ',' decimals, " $US" — e.g. 1250.75 -> "1.250,75 $US". (Input unit
 * unchanged from before; only the separators changed.)
 */
export function formatUSD(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  const sign = amount < 0 ? '-' : '';
  const [int, dec] = Math.abs(amount).toFixed(2).split('.');
  return `${sign}${groupThousands(int)},${dec} $US`;
}
