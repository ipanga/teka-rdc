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
