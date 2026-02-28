/** Translatable text field { fr, en } */
export interface TranslatableText {
  fr?: string;
  en?: string;
}

/** Category from GET /api/v1/browse/categories */
export interface BrowseCategory {
  id: string;
  name: TranslatableText;
  emoji: string | null;
  slug: string;
  parentId: string | null;
  subcategories: BrowseCategory[];
  productCount: number;
}

/** Product image */
export interface ProductImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  alt: string | null;
  position: number;
}

/** Seller info in browse product */
export interface BrowseSeller {
  id: string;
  businessName: string;
}

/** Product from GET /api/v1/browse/products */
export interface BrowseProduct {
  id: string;
  title: TranslatableText;
  description?: TranslatableText;
  priceCDF: string;
  priceUSD?: number | null;
  condition: 'NEW' | 'USED';
  quantity: number;
  image: { url: string; thumbnailUrl: string } | null;
  seller: BrowseSeller;
  categoryId: string;
}

/** Specification item */
export interface ProductSpecification {
  id: string;
  name: TranslatableText;
  value: TranslatableText;
}

/** Full product detail from GET /api/v1/browse/products/:id */
export interface ProductDetail {
  id: string;
  title: TranslatableText;
  description: TranslatableText;
  priceCDF: string;
  priceUSD?: number | null;
  condition: 'NEW' | 'USED';
  quantity: number;
  images: ProductImage[];
  seller: BrowseSeller;
  categoryId: string;
  category: {
    id: string;
    name: TranslatableText;
    breadcrumb: { id: string; name: TranslatableText }[];
  };
  specifications: ProductSpecification[];
}

/** Cursor-based pagination */
export interface CursorPagination {
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

/** Paginated product response */
export interface PaginatedProducts {
  data: BrowseProduct[];
  pagination: CursorPagination;
}

// ========================
// Cart Types
// ========================

/** Cart item from API */
export interface CartItem {
  productId: string;
  quantity: number;
  product: {
    id: string;
    title: TranslatableText;
    priceCDF: string;
    priceUSD?: number | null;
    quantity: number; // stock available
    condition: 'NEW' | 'USED';
    image: { url: string; thumbnailUrl: string } | null;
    seller: BrowseSeller;
  };
}

/** Guest cart item (stored in localStorage) */
export interface GuestCartItem {
  productId: string;
  quantity: number;
}

/** Cart from API */
export interface Cart {
  items: CartItem[];
  totalItems: number;
  totalCDF: string;
}

// ========================
// Order Types
// ========================

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUNDED';

export type PaymentMethod = 'COD' | 'MOBILE_MONEY';

export type MobileMoneyProvider = 'M_PESA' | 'AIRTEL_MONEY' | 'ORANGE_MONEY';

/** Order status log entry */
export interface OrderStatusLog {
  id: string;
  status: OrderStatus;
  note?: string | null;
  createdAt: string;
}

/** Order item snapshot */
export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPriceCDF: string;
  totalPriceCDF: string;
  productSnapshot: {
    title: TranslatableText;
    image: { url: string; thumbnailUrl: string } | null;
  };
}

/** Order seller info (expanded from API) */
export interface OrderSeller {
  id: string;
  firstName: string;
  lastName: string;
  sellerProfile: { businessName: string } | null;
}

/** Order from API */
export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus?: PaymentStatus;
  subtotalCDF: string;
  deliveryFeeCDF: string;
  totalCDF: string;
  buyerNote?: string | null;
  seller: OrderSeller;
  items: OrderItem[];
  deliveryAddress: {
    id: string;
    recipientName: string;
    phone: string;
    town: string;
    neighborhood: string;
    avenue?: string | null;
    details?: string | null;
  };
  statusLogs: OrderStatusLog[];
  createdAt: string;
  updatedAt: string;
}

/** Paginated orders response */
export interface PaginatedOrders {
  data: Order[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

/** Address from API */
export interface Address {
  id: string;
  recipientName: string;
  phone: string;
  town: string;
  neighborhood: string;
  avenue?: string | null;
  details?: string | null;
  isDefault: boolean;
}

/** Checkout request body */
export interface CheckoutRequest {
  deliveryAddressId: string;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  buyerNote?: string;
  mobileMoneyProvider?: string;
  payerPhone?: string;
}

/** Checkout response */
export interface CheckoutResponse {
  orders: {
    id: string;
    orderNumber: string;
  }[];
  checkoutGroupId?: string;
  paymentPending?: boolean;
  externalReferences?: string[];
}

/** Transaction from API */
export interface Transaction {
  id: string;
  orderId: string;
  type: string;
  provider: string;
  amountCDF: string;
  status: PaymentStatus;
  externalReference?: string;
  createdAt: string;
}

/** Delivery estimate */
export interface DeliveryEstimate {
  feeCDF: string;
  estimatedDays: number;
}

// ========================
// Review Types
// ========================

/** Review from API */
export interface Review {
  id: string;
  productId: string;
  userId: string;
  orderId: string;
  rating: number;
  text?: string | null;
  user: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
  };
  createdAt: string;
}

/** Review stats from API */
export interface ReviewStats {
  avgRating: number;
  totalReviews: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

/** Paginated reviews response */
export interface PaginatedReviews {
  data: Review[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

// ========================
// Wishlist Types
// ========================

/** Wishlist item from API */
export interface WishlistItem {
  id: string;
  productId: string;
  product: BrowseProduct;
  createdAt: string;
}

/** Paginated wishlist response */
export interface PaginatedWishlist {
  data: WishlistItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

// ========================
// Messaging Types
// ========================

/** Conversation from API */
export interface Conversation {
  id: string;
  otherParty: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    businessName?: string | null;
  };
  lastMessage?: {
    content: string;
    senderId: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Message from API */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
}

/** Paginated conversations response */
export interface PaginatedConversations {
  data: Conversation[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

/** Paginated messages response */
export interface PaginatedMessages {
  data: Message[];
  meta: {
    before?: string;
    limit: number;
    hasMore: boolean;
  };
}

// ========================
// Banner Types (Phase 7)
// ========================

/** Banner from GET /api/v1/browse/banners */
export interface Banner {
  id: string;
  title: TranslatableText;
  subtitle?: TranslatableText | null;
  imageUrl: string;
  linkUrl?: string | null;
  linkType?: 'product' | 'category' | 'url' | 'promotion' | null;
  linkTarget?: string | null;
  sortOrder: number;
}

// ========================
// Flash Deal Types (Phase 7)
// ========================

/** Flash deal from GET /api/v1/browse/flash-deals */
export interface FlashDeal {
  id: string;
  type: string;
  title: TranslatableText;
  discountPercent?: number | null;
  discountCDF?: string | null;
  startsAt: string;
  endsAt: string;
  product: {
    id: string;
    title: TranslatableText;
    priceCDF: string;
    images: { url: string }[];
  };
}

// ========================
// Content Page Types (Phase 7)
// ========================

/** Content page from GET /api/v1/content/:slug */
export interface ContentPage {
  slug: string;
  title: TranslatableText;
  content: TranslatableText;
  status: string;
}

/** Content page summary from GET /api/v1/content */
export interface ContentPageSummary {
  slug: string;
  title: TranslatableText;
}
