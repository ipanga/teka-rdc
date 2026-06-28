export const DEFAULT_CURRENCY = 'CDF' as const;
export const SUPPORTED_CURRENCIES = ['CDF', 'USD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Group an integer's digits with '.' as the thousand separator — the DRC
 * convention for francs (1250000 → "1.250.000"). Input is the absolute
 * integer part as a digit string.
 */
export function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Canonical Congolese-Franc formatter. Takes the amount in **centimes**
 * (minor units) and renders the user-facing string with '.' thousand
 * separators, no decimals, and the " FC" label (how DRC users say the franc).
 * Null/undefined/empty/non-finite → "—". Example: 5295700 → "52.957 FC".
 */
export function formatFC(centimes: number | string | null | undefined): string {
  if (centimes === null || centimes === undefined || centimes === '') return '—';
  const n = Number(centimes);
  if (!Number.isFinite(n)) return '—';
  const fc = Math.round(n / 100);
  const sign = fc < 0 ? '-' : '';
  return `${sign}${groupThousands(Math.abs(fc).toString())} FC`;
}

/** Back-compat alias — same behaviour as {@link formatFC}. */
export const formatCDF = formatFC;

/**
 * USD formatter (French-style): takes the amount in **cents**, renders '.'
 * thousands + ',' decimals with two fraction digits and the " $US" label.
 * Null/undefined/empty/non-finite → "". Example: 125075 → "1.250,75 $US".
 */
export function formatUSD(cents: number | string | null | undefined): string {
  if (cents === null || cents === undefined || cents === '') return '';
  const n = Number(cents);
  if (!Number.isFinite(n)) return '';
  const usd = n / 100;
  const sign = usd < 0 ? '-' : '';
  const [int, dec] = Math.abs(usd).toFixed(2).split('.');
  return `${sign}${groupThousands(int)},${dec} $US`;
}
