export const MOBILE_MONEY_PROVIDERS = ['M_PESA', 'AIRTEL_MONEY', 'ORANGE_MONEY'] as const;
export const PAYOUT_STATUSES = ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED'] as const;
export const TRANSACTION_TYPES = ['PAYMENT', 'REFUND', 'PAYOUT'] as const;
export const TRANSACTION_PROVIDERS = ['FLEXPAY', 'COD', 'MANUAL'] as const;

export const DEFAULT_COMMISSION_RATE = 0.10; // 10%
export const MIN_PAYOUT_AMOUNT_CDF = 500000; // 5,000 CDF in centimes

export const MOBILE_MONEY_PROVIDER_LABELS: Record<string, string> = {
  M_PESA: 'M-Pesa (Vodacom)',
  AIRTEL_MONEY: 'Airtel Money',
  ORANGE_MONEY: 'Orange Money',
};
