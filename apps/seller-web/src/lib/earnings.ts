/**
 * Seller earnings presentation helpers — pure. Rates arrive as Decimal(5,4)
 * fractions ("0.1", "0.0825"); the API-derived `state` says what an earning
 * row means (held in the return window, available, reserved, paid, reversed).
 */
export type EarningState = 'REVERSED' | 'PAID' | 'RESERVED' | 'HELD' | 'AVAILABLE';

/** "0.0825" → "8,25 %", "0.1" → "10 %". Integer math on the string, no float. */
export function formatCommissionRate(rate: string | number | null | undefined): string {
  if (rate === null || rate === undefined) return '—';
  const s = String(rate).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return '—';
  const [int, frac = ''] = s.split('.');
  const units = Number(int) * 10000 + Number((frac + '0000').slice(0, 4)); // ten-thousandths
  const whole = Math.floor(units / 100);
  const hundredths = units % 100;
  if (hundredths === 0) return `${whole} %`;
  return `${whole},${String(hundredths).padStart(2, '0').replace(/0$/, '')} %`;
}

export const EARNING_STATE_LABELS: Record<EarningState, string> = {
  HELD: 'En attente (retour possible)',
  AVAILABLE: 'Disponible',
  RESERVED: 'Réservé (virement en cours)',
  PAID: 'Payé',
  REVERSED: 'Annulé',
};

export const EARNING_STATE_STYLES: Record<EarningState, string> = {
  HELD: 'bg-warning/10 text-warning',
  AVAILABLE: 'bg-blue-100 text-blue-700',
  RESERVED: 'bg-primary/10 text-primary',
  PAID: 'bg-success/15 text-success',
  REVERSED: 'bg-muted text-muted-foreground',
};

/** Older API responses have no `state`: fall back to the historical isPaid split. */
export function earningStateOf(e: { state?: string | null; isPaid: boolean }): EarningState {
  const s = e.state as EarningState | undefined;
  if (s && s in EARNING_STATE_LABELS) return s;
  return e.isPaid ? 'PAID' : 'AVAILABLE';
}
