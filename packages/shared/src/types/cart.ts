import type { TranslatableText, Timestamps } from './common';

// Cart
export interface Cart extends Timestamps {
  id: string;
  userId: string;
  items: CartItem[];
}

export interface CartItem extends Timestamps {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  product?: CartProduct;
}

export interface CartProduct {
  id: string;
  title: TranslatableText;
  priceCDF: string; // BigInt serialized as string
  priceUSD?: string | null;
  quantity: number; // available stock
  condition: string;
  status: string;
  sellerId: string;
  seller?: { sellerProfile?: { businessName: string } | null };
  images?: { id: string; thumbnailUrl: string }[];
}

// Cart summary (computed by API)
export interface CartSummary {
  items: CartItem[];
  sellerGroups: SellerCartGroup[];
  totalItems: number;
  totalCDF: string;
}

export interface SellerCartGroup {
  sellerId: string;
  sellerName: string;
  items: CartItem[];
  subtotalCDF: string;
}

// Request DTOs
export interface AddToCartRequest {
  productId: string;
  quantity: number;
}

export interface UpdateCartItemRequest {
  quantity: number;
}

export interface MergeCartRequest {
  items: { productId: string; quantity: number }[];
}
