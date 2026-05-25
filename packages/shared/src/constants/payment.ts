export const PAYOUT_STATUSES = ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED'] as const;
export const TRANSACTION_TYPES = ['PAYMENT', 'REFUND', 'PAYOUT'] as const;
export const TRANSACTION_PROVIDERS = ['FLEXPAY', 'COD', 'MANUAL'] as const;

export const DEFAULT_COMMISSION_RATE = 0.10; // 10%
export const MIN_PAYOUT_AMOUNT_CDF = 500000; // 5,000 CDF in centimes
