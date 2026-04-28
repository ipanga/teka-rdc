export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
export type PayoutStatus = 'REQUESTED' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
export type MobileMoneyProvider = 'M_PESA' | 'AIRTEL_MONEY' | 'ORANGE_MONEY';

export interface SellerWallet {
  balanceCDF: string;
  totalEarnedCDF: string;
  totalCommissionCDF: string;
  pendingPayoutCDF: string;
}

export interface SellerEarning {
  id: string;
  orderId: string;
  grossAmountCDF: string;
  commissionCDF: string;
  netAmountCDF: string;
  commissionRate: string;
  isPaid: boolean;
  order?: { orderNumber: string; totalCDF: string; createdAt: string };
  createdAt: string;
}

export interface Payout {
  id: string;
  amountCDF: string;
  status: PayoutStatus;
  payoutMethod: string;
  payoutPhone: string;
  rejectionReason?: string | null;
  requestedAt: string;
  approvedAt?: string | null;
  processedAt?: string | null;
  createdAt: string;
}

export interface Review {
  id: string;
  rating: number;
  comment?: string | null;
  buyer: {
    id: string;
    firstName: string;
    lastName: string;
  };
  product?: {
    id: string;
    title: string;
  };
  createdAt: string;
}

export interface ReviewStats {
  averageRating: number;
  totalReviews: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface SellerProduct {
  id: string;
  title: string;
  status: string;
  priceCDF: string;
  quantity: number;
  reviewCount?: number;
  averageRating?: number;
  createdAt: string;
}

export interface Conversation {
  id: string;
  lastMessage?: {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
  } | null;
  buyer?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  seller?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  product?: {
    id: string;
    title: string;
  } | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  conversationId: string;
  createdAt: string;
}

export type PromotionStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export type PromotionType = 'PROMOTION' | 'FLASH_DEAL';

export interface Promotion {
  id: string;
  type: PromotionType;
  title: string;
  description?: string | null;
  discountPercent?: number | null;
  discountCDF?: string | null;
  startsAt: string;
  endsAt: string;
  status: PromotionStatus;
  rejectionReason?: string | null;
  product?: {
    id: string;
    title: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}
