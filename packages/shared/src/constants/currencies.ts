export const DEFAULT_CURRENCY = 'CDF' as const;
export const SUPPORTED_CURRENCIES = ['CDF', 'USD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function formatCDF(centimes: number): string {
  const value = centimes / 100;
  return new Intl.NumberFormat('fr-CD', {
    style: 'currency',
    currency: 'CDF',
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatUSD(cents: number): string {
  const value = cents / 100;
  return new Intl.NumberFormat('fr-CD', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}
