/**
 * Commission configuration — pure presentation/validation helpers.
 *
 * The API stores rates as Decimal(5,4) fractions (0 … 1, 4 decimals = 0,01 %
 * precision) and is the only place that decides which rate applies:
 *   taux spécifique du vendeur ?? taux de la catégorie ?? taux par défaut
 * Operators type PERCENTAGES. Conversion is string/integer based (no float
 * arithmetic), the server re-validates everything, and nothing here is ever
 * used to compute money.
 */

export type CommissionSource = 'SELLER' | 'CATEGORY' | 'GLOBAL' | 'MIXED';

/** Ten-thousandths of 1 — the integer form of a Decimal(5,4) rate. */
const RATE_UNITS = 10_000;

/** Fraction string ("0.0825", "0.1", "1") → integer units (825, 1000, 10000). Null on garbage. */
export function rateToUnits(rate: string | number | null | undefined): number | null {
  if (rate === null || rate === undefined) return null;
  const s = String(rate).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [int, frac = ''] = s.split('.');
  if (frac.length > 4) return null;
  const units = Number(int) * RATE_UNITS + Number((frac + '0000').slice(0, 4));
  return units >= 0 && units <= RATE_UNITS ? units : null;
}

/** Integer units → fraction string the API accepts ("0.0825"). */
export function unitsToRate(units: number): string {
  const int = Math.floor(units / RATE_UNITS);
  const frac = String(units % RATE_UNITS).padStart(4, '0').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : String(int);
}

/** "0.0825" → "8,25 %", "0.1" → "10 %", "0" → "0 %", null → "—". French formatting. */
export function formatRatePercent(rate: string | number | null | undefined): string {
  const units = rateToUnits(rate);
  if (units === null) return '—';
  const whole = Math.floor(units / 100);
  const hundredths = units % 100;
  if (hundredths === 0) return `${whole} %`;
  const frac = String(hundredths).padStart(2, '0').replace(/0$/, '');
  return `${whole},${frac} %`;
}

/** Fraction → what to prefill in the percent input ("8,25", "10"). */
export function rateToPercentInput(rate: string | number | null | undefined): string {
  const label = formatRatePercent(rate);
  return label === '—' ? '' : label.replace(/\s?%$/, '');
}

export const PERCENT_INPUT_HINT =
  'Pourcentage entre 0 et 100, au plus 2 décimales (ex. 8,25).';

/**
 * Percent typed by the operator ("8,25", "8.25", "10", "0") → API fraction.
 * Accepts the French comma. Returns a French error for anything else.
 */
export function parsePercentInput(input: string): { rate: string; units: number } | { error: string } {
  const s = input.trim().replace(',', '.');
  if (s === '') return { error: 'Saisissez un taux.' };
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) {
    return { error: `Taux invalide. ${PERCENT_INPUT_HINT}` };
  }
  const [int, frac = ''] = s.split('.');
  const units = Number(int) * 100 + Number((frac + '00').slice(0, 2));
  if (units > RATE_UNITS) return { error: 'Le taux ne peut pas dépasser 100 %.' };
  return { rate: unitsToRate(units), units };
}

/** JSON body value for the API DTO (`rate: number`, ≤ 4 decimals). */
export function rateToApiNumber(rate: string): number {
  return Number(rate);
}

export interface SellerCommissionContext {
  overrideRate: string | null;
  platformDefaultRate: string | null;
  effectiveRate: string | null;
  effectiveSource: CommissionSource | null;
  activeCategoryOverrides: number;
}

/** One sentence that says, without ambiguity, which rate this seller pays and why. */
export function describeEffective(ctx: SellerCommissionContext): string {
  if (ctx.effectiveSource === 'SELLER') {
    return `Ce vendeur paie ${formatRatePercent(ctx.effectiveRate)} sur chaque vente livrée (taux spécifique). Les taux par catégorie et le taux par défaut ne s’appliquent pas à lui.`;
  }
  if (ctx.effectiveSource === 'GLOBAL') {
    const base = `Ce vendeur paie le taux par défaut de la plateforme, ${formatRatePercent(ctx.platformDefaultRate)}.`;
    return ctx.activeCategoryOverrides > 0
      ? `${base} Exception : ${ctx.activeCategoryOverrides} catégorie${ctx.activeCategoryOverrides > 1 ? 's ont' : ' a'} un taux propre, appliqué à ses articles de ${ctx.activeCategoryOverrides > 1 ? 'ces catégories' : 'cette catégorie'}.`
      : base;
  }
  return 'Aucun taux par défaut n’est configuré : les commandes de ce vendeur ne peuvent pas être livrées tant que la plateforme n’a pas de taux. Configurez-le dans Finance → Commissions.';
}

export const PRECEDENCE_COPY =
  'Ordre d’application : taux spécifique du vendeur, sinon taux de la catégorie de l’article, sinon taux par défaut de la plateforme.';

export const HISTORY_COPY =
  'Un changement de taux ne s’applique qu’aux commandes livrées après l’enregistrement. Les revenus déjà constatés gardent le taux et le montant enregistrés à la livraison ; ils ne sont jamais recalculés.';

export const HISTORY_ACTION_LABELS: Record<string, string> = {
  COMMISSION_SETTING_UPSERTED: 'Taux enregistré',
  COMMISSION_SETTING_REMOVED: 'Taux par catégorie retiré',
  SELLER_COMMISSION_OVERRIDE_SET: 'Taux spécifique vendeur défini',
  SELLER_COMMISSION_OVERRIDE_CLEARED: 'Taux spécifique vendeur retiré',
};
