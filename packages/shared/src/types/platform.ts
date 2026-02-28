import type { Timestamps } from './common';

// ============================================================
// BANNER
// ============================================================

export type BannerStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'ARCHIVED';
export type BannerLinkType = 'product' | 'category' | 'promotion' | 'url';

export interface Banner extends Timestamps {
  id: string;
  title: { fr: string; en?: string };
  subtitle?: { fr: string; en?: string } | null;
  imageUrl: string;
  linkUrl?: string | null;
  linkType?: BannerLinkType | null;
  linkTarget?: string | null;
  status: BannerStatus;
  sortOrder: number;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface CreateBannerRequest {
  title: { fr: string; en?: string };
  subtitle?: { fr: string; en?: string };
  imageUrl: string;
  linkUrl?: string;
  linkType?: BannerLinkType;
  linkTarget?: string;
  status?: BannerStatus;
  sortOrder?: number;
  startsAt?: string;
  endsAt?: string;
}

// ============================================================
// PROMOTION / FLASH DEAL
// ============================================================

export type PromotionType = 'PROMOTION' | 'FLASH_DEAL';
export type PromotionStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export interface Promotion extends Timestamps {
  id: string;
  type: PromotionType;
  title: { fr: string; en?: string };
  description?: { fr: string; en?: string } | null;
  discountPercent?: number | null;
  discountCDF?: string | null;
  status: PromotionStatus;
  startsAt: string;
  endsAt: string;
  productId?: string | null;
  categoryId?: string | null;
  sellerId?: string | null;
  rejectionReason?: string | null;
  product?: { id: string; title: { fr: string; en?: string } } | null;
  category?: { id: string; name: { fr: string; en?: string } } | null;
}

export interface CreatePromotionRequest {
  type: PromotionType;
  title: { fr: string; en?: string };
  description?: { fr: string; en?: string };
  discountPercent?: number;
  discountCDF?: number;
  startsAt: string;
  endsAt: string;
  productId?: string;
  categoryId?: string;
  sellerId?: string;
}

export interface SellerCreatePromotionRequest {
  type: PromotionType;
  title: { fr: string; en?: string };
  description?: { fr: string; en?: string };
  discountPercent?: number;
  discountCDF?: number;
  startsAt: string;
  endsAt: string;
  productId: string;
}

// ============================================================
// CONTENT PAGE
// ============================================================

export type ContentPageStatus = 'DRAFT' | 'PUBLISHED';

export interface ContentPage {
  id: string;
  slug: string;
  title: { fr: string; en?: string };
  content: { fr: string; en?: string };
  status: ContentPageStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertContentPageRequest {
  slug: string;
  title: { fr: string; en?: string };
  content: { fr: string; en?: string };
  status?: ContentPageStatus;
  sortOrder?: number;
}

// ============================================================
// SYSTEM SETTING
// ============================================================

export type SystemSettingType = 'boolean' | 'string' | 'number' | 'json';

export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  type: SystemSettingType;
  label?: { fr: string; en?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSettingRequest {
  value: string;
}

// ============================================================
// NOTIFICATION BROADCAST
// ============================================================

export type NotificationBroadcastStatus = 'DRAFT' | 'SENDING' | 'SENT' | 'FAILED';

export interface NotificationBroadcast {
  id: string;
  title: string;
  message: string;
  segment: string;
  status: NotificationBroadcastStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  scheduledAt?: string | null;
  sentAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBroadcastRequest {
  title: string;
  message: string;
  segment: string;
}

// ============================================================
// DASHBOARD TRENDS
// ============================================================

export interface TrendDataPoint {
  date: string;
  value: number;
}

export interface DashboardTrends {
  revenueDaily: TrendDataPoint[];
  ordersDaily: TrendDataPoint[];
  usersDaily: TrendDataPoint[];
  gmvDaily: TrendDataPoint[];
}

// ============================================================
// REPORTS
// ============================================================

export type ReportType = 'sales' | 'financial' | 'seller_performance';

export interface ReportQuery {
  type: ReportType;
  dateFrom: string;
  dateTo: string;
  sellerId?: string;
}
