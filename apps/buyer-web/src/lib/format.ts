/**
 * Format a BigInt string (centimes) as CDF currency.
 * Example: "150000" (1500 centimes) -> "1 500 CDF"
 */
export function formatCDF(centimes: string): string {
  const amount = Number(centimes) / 100;
  return new Intl.NumberFormat('fr-CD', {
    style: 'currency',
    currency: 'CDF',
    maximumFractionDigits: 0,
  }).format(amount);
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

/**
 * Compatibility shim — the API used to return `{ fr, en }` translation
 * objects; since the FR-only refactor it returns plain strings. This helper
 * accepts either shape so callers don't have to change every call site at
 * once. The `locale` argument is ignored (kept for back-compat).
 *
 * @deprecated Read the field directly. This shim exists during the
 * monolingual transition and will be removed once all consumers stop
 * passing translation objects.
 */
export function getLocalizedName(
  value: string | { fr?: string; en?: string } | null | undefined,
  _locale?: string,
): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.fr || value.en || '';
}
