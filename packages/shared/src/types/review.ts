import type { Timestamps } from './common';

export type ReviewStatus = 'ACTIVE' | 'HIDDEN';

export interface Review extends Timestamps {
  id: string;
  productId: string;
  buyerId: string;
  orderId: string;
  rating: number;
  text?: string | null;
  status: ReviewStatus;
  buyer?: ReviewBuyer;
  product?: ReviewProduct;
}

export interface ReviewBuyer {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
}

export interface ReviewProduct {
  id: string;
  title: { fr: string; en?: string };
  avgRating: number;
  totalReviews: number;
}

export interface ReviewStats {
  avgRating: number;
  totalReviews: number;
  distribution: Record<number, number>;
}

export interface CreateReviewRequest {
  productId: string;
  orderId: string;
  rating: number;
  text?: string;
}

export interface CanReviewResponse {
  canReview: boolean;
  reason?: string;
}

export interface WishlistItem {
  id: string;
  productId: string;
  createdAt: string;
  product?: WishlistProduct;
}

export interface WishlistProduct {
  id: string;
  title: { fr: string; en?: string };
  priceCDF: string;
  priceUSD?: string | null;
  condition: string;
  quantity: number;
  image?: { url: string; thumbnailUrl?: string } | null;
  seller?: { businessName?: string | null };
  avgRating: number;
  totalReviews: number;
}
