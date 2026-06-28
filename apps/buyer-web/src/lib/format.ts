/**
 * Format a BigInt string (centimes) as Congolese-Franc currency.
 * The user-facing label is **FC** (how DRC users refer to the franc), not the
 * ISO "CDF". Example: "150000" (1500 centimes) -> "1 500 FC".
 */
export function formatCDF(centimes: string): string {
  const amount = Number(centimes) / 100;
  return `${new Intl.NumberFormat('fr-CD', {
    maximumFractionDigits: 0,
  }).format(amount)} FC`;
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
 * Format a number as USD currency.
 */
export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('fr-CD', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}
