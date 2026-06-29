/** Category from GET /api/v1/browse/categories */
export interface BrowseCategory {
  id: string;
  name: string;
  emoji: string | null;
  // Nullable: backfilled by the seed but new admin-created categories may
  // arrive without one. Routes guard with `cat.slug ? ... : ...`.
  slug: string | null;
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
  // Cosmetic slug + unique resolver code. Canonical URL is
  // `/{citySlug}/{slug}-{shortCode}` (built via lib/urls.ts).
  slug?: string | null;
  shortCode?: string | null;
  title: string;
  description?: string;
  priceCDF: string;
  priceUSD?: number | null;
  // Optional seller-set promotional price (centimes string). When present the
  // effective/charged price is discountPriceCDF; the original priceCDF is shown
  // struck through. The API guarantees discount < price.
  discountPriceCDF?: string | null;
  discountPriceUSD?: string | null;
  condition: 'NEW' | 'USED';
  quantity: number;
  image: { url: string; thumbnailUrl: string } | null;
  seller: BrowseSeller;
  categoryId: string;
  // City of availability — lets each card build its own city-first URL.
  cityId?: string | null;
  citySlug?: string | null;
  cityName?: string | null;
  // Best-seller social proof: total delivered units. Rendered as "X vendus"
  // only when > 0.
  unitsSold?: number | null;
  // Rating social proof — denormalized on Product. Stars render only when
  // totalReviews > 0.
  avgRating?: number | null;
  totalReviews?: number | null;
  // Brand label, shown above the title on the card when present.
  brand?: { name: string } | null;
}

/** Specification item */
export interface ProductSpecification {
  id: string;
  name: string;
  value: string;
}

/** Full product detail from GET /api/v1/browse/products/:id */
export interface ProductDetail {
  id: string;
  slug?: string | null;
  shortCode?: string | null;
  title: string;
  description: string;
  priceCDF: string;
  priceUSD?: number | null;
  discountPriceCDF?: string | null;
  discountPriceUSD?: string | null;
  condition: 'NEW' | 'USED';
  quantity: number;
  images: ProductImage[];
  seller: BrowseSeller;
  categoryId: string;
  cityId?: string | null;
  // City of availability — drives the canonical URL + breadcrumb.
  city?: { id: string; slug: string | null; name: string; province: string } | null;
  category: {
    id: string;
    slug: string | null;
    name: string;
  };
  // Full category path (Catégorie → Sous-catégorie → Type de produit), returned
  // at the top level by getProductDetail. Ends with the product's own category.
  breadcrumb: { id: string; slug: string | null; name: string }[];
  specifications: ProductSpecification[];
  unitsSold?: number | null;
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
    title: string;
    priceCDF: string;
    priceUSD?: number | null;
    discountPriceCDF?: string | null;
    discountPriceUSD?: string | null;
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
  | 'READY_FOR_TEKA_PICKUP'
  | 'RECEIVED_AT_TEKA'
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

// MOBILE_MONEY value retained on the union for read-only display of legacy
// orders placed before Mobile Money was retired (PR B1, 2026-05-25). The
// checkout flow only creates `'COD'` orders.
export type PaymentMethod = 'COD' | 'MOBILE_MONEY';

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
    title: string;
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
  deliveredAt?: string | null;
  returnedAt?: string | null;
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

/** Paginated orders response — the API envelope's `data` for GET /v1/orders.
 * The list is at `.data` and pagination at `.pagination` (the server's key). */
export interface PaginatedOrders {
  data: Order[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** Address from API */
export interface Address {
  id: string;
  recipientName: string;
  phone: string;
  province?: string;
  town: string;
  neighborhood: string;
  avenue?: string | null;
  details?: string | null;
  isDefault: boolean;
  cityId?: string | null;
  communeId?: string | null;
}

/** Commune from GET /v1/cities/:cityId/communes */
export interface Commune {
  id: string;
  cityId: string;
  name: string;
}

/** Checkout request body */
export interface CheckoutRequest {
  deliveryAddressId: string;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  buyerNote?: string;
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

/** Paginated wishlist response. `data` is the array directly; `meta` is a
 *  top-level sibling of `data` on the envelope (not nested under it). */
export interface PaginatedWishlist {
  data: WishlistItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages?: number;
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
  title: string;
  subtitle?: string | null;
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
  title: string;
  discountPercent?: number | null;
  discountCDF?: string | null;
  startsAt: string;
  endsAt: string;
  product: {
    id: string;
    slug?: string;
    title: string;
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
  title: string;
  content: string;
  status: string;
}

/** Content page summary from GET /api/v1/content */
export interface ContentPageSummary {
  slug: string;
  title: string;
}
