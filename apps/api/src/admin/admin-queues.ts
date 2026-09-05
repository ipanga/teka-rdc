import {
  OrderStatus,
  PayoutStatus,
  Prisma,
  ProductStatus,
  SellerVerificationStatus,
} from '@prisma/client';

/**
 * Authoritative definitions of the admin "À traiter" queues.
 *
 * The dashboard COUNTS and the list endpoints the tiles deep-link to must
 * agree, so both read these `where` builders (never duplicate the filters).
 * `admin-queues.spec.ts` pins that the stats service and the list services
 * use them, and `admin-web` mirrors the deep links in `lib/action-center.ts`.
 */
export const ADMIN_QUEUES = {
  /** Seller applications awaiting KYC review → /dashboard/sellers?status=PENDING */
  sellerApplicationsPending: (): Prisma.SellerProfileWhereInput => ({
    applicationStatus: 'PENDING',
    deletedAt: null,
  }),
  /**
   * Seller document sets awaiting verification review (separate from the
   * account application) → /dashboard/sellers?verification=PENDING_REVIEW
   */
  sellerVerificationsPending: (): Prisma.SellerProfileWhereInput => ({
    verificationStatus: SellerVerificationStatus.PENDING_REVIEW,
    deletedAt: null,
  }),
  /** Products awaiting moderation → /dashboard/products?status=PENDING_REVIEW */
  productsPendingReview: (): Prisma.ProductWhereInput => ({
    status: ProductStatus.PENDING_REVIEW,
    deletedAt: null,
  }),
  /** Return requests awaiting a decision → /dashboard/returns?status=REQUESTED */
  returnsPending: (): Prisma.ReturnRequestWhereInput => ({
    status: 'REQUESTED',
    deletedAt: null,
  }),
  /** Payout requests awaiting authorization → /dashboard/payouts?status=REQUESTED */
  payoutsAwaitingReview: (): Prisma.PayoutWhereInput => ({
    status: PayoutStatus.REQUESTED,
  }),
  /**
   * Authorized payouts whose cash still has to be sent (APPROVED, or PROCESSING
   * when the transfer was started) → /dashboard/payouts?status=APPROVED (+ PROCESSING).
   */
  payoutsAwaitingPayment: (): Prisma.PayoutWhereInput => ({
    status: { in: [PayoutStatus.APPROVED, PayoutStatus.PROCESSING] },
  }),
  /** Parcels the seller flagged ready — Teka must collect → /dashboard/orders?status=READY_FOR_TEKA_PICKUP */
  ordersReadyForPickup: (): Prisma.OrderWhereInput => ({
    status: OrderStatus.READY_FOR_TEKA_PICKUP,
    deletedAt: null,
  }),
  /** Parcels in the warehouse — Teka must dispatch → /dashboard/orders?status=RECEIVED_AT_TEKA */
  ordersReceivedAtTeka: (): Prisma.OrderWhereInput => ({
    status: OrderStatus.RECEIVED_AT_TEKA,
    deletedAt: null,
  }),
} as const;

export type AdminQueueKey = keyof typeof ADMIN_QUEUES;
