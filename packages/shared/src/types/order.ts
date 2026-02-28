import type { TranslatableText, Timestamps } from './common';

// Enums
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
export type PaymentMethod = 'MOBILE_MONEY' | 'COD';
export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

// Order
export interface Order extends Timestamps {
  id: string;
  orderNumber: string;
  checkoutGroupId: string;
  buyerId: string;
  sellerId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryAddressId: string;
  deliveryFeeCDF: string;
  deliveryFeeUSD?: string | null;
  subtotalCDF: string;
  subtotalUSD?: string | null;
  totalCDF: string;
  totalUSD?: string | null;
  buyerNote?: string | null;
  cancellationReason?: string | null;
  items?: OrderItem[];
  statusLogs?: OrderStatusLog[];
  buyer?: OrderUser;
  seller?: OrderUser;
  deliveryAddress?: OrderAddress;
}

// Order Item (snapshot of product at time of purchase)
export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPriceCDF: string;
  unitPriceUSD?: string | null;
  totalCDF: string;
  totalUSD?: string | null;
  productTitle: TranslatableText;
  productImage?: string | null;
  createdAt: string;
}

// Order status audit trail
export interface OrderStatusLog {
  id: string;
  orderId: string;
  fromStatus?: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy?: string | null;
  note?: string | null;
  createdAt: string;
}

// Embedded user info on order
export interface OrderUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phone: string;
  sellerProfile?: { businessName: string } | null;
}

// Embedded address on order
export interface OrderAddress {
  id: string;
  province: string;
  town: string;
  neighborhood?: string | null;
  avenue?: string | null;
  reference?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
}

// Checkout request/response
export interface CheckoutRequest {
  deliveryAddressId: string;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  buyerNote?: string;
  mobileMoneyProvider?: string;
  payerPhone?: string;
}

export interface CheckoutResponse {
  orders: Order[];
  checkoutGroupId: string;
  paymentPending?: boolean;
  externalReferences?: string[];
}

// Delivery zones
export interface DeliveryZone extends Timestamps {
  id: string;
  fromTown: string;
  toTown: string;
  feeCDF: string;
  feeUSD?: string | null;
  isActive: boolean;
}

export interface DeliveryEstimate {
  feeCDF: string;
  feeUSD?: string | null;
}
