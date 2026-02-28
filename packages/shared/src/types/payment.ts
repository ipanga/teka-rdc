import type { Timestamps } from './common';

// Mobile Money sub-providers
export type MobileMoneyProvider = 'M_PESA' | 'AIRTEL_MONEY' | 'ORANGE_MONEY';

// Transaction enums
export type TransactionType = 'PAYMENT' | 'REFUND' | 'PAYOUT';
export type TransactionProvider = 'FLEXPAY' | 'COD' | 'MANUAL';
export type PayoutStatus = 'REQUESTED' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';

// Transaction record
export interface Transaction {
  id: string;
  orderId: string;
  type: TransactionType;
  provider: TransactionProvider;
  amountCDF: string;
  amountUSD?: string | null;
  currency: string;
  status: string; // PaymentStatus
  externalReference?: string | null;
  failureReason?: string | null;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
}

// Seller earnings (one per delivered+paid order)
export interface SellerEarning {
  id: string;
  sellerProfileId: string;
  orderId: string;
  grossAmountCDF: string;
  commissionCDF: string;
  netAmountCDF: string;
  commissionRate: string;
  isPaid: boolean;
  payoutId?: string | null;
  createdAt: string;
}

// Aggregated seller wallet info
export interface SellerWallet {
  balanceCDF: string;
  totalEarnedCDF: string;
  totalCommissionCDF: string;
  pendingPayoutCDF: string;
}

// Payout request
export interface Payout extends Timestamps {
  id: string;
  sellerProfileId: string;
  amountCDF: string;
  currency: string;
  status: PayoutStatus;
  payoutMethod: string;
  payoutPhone: string;
  externalReference?: string | null;
  rejectionReason?: string | null;
  requestedAt: string;
  approvedAt?: string | null;
  processedAt?: string | null;
}

// Commission setting
export interface CommissionSetting {
  id: string;
  categoryId?: string | null;
  rate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  categoryName?: string | null;
}
