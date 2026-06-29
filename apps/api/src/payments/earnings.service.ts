import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, OrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { RETURN_WINDOW_DAYS } from '../orders/order-workflow.constants';

const DEFAULT_COMMISSION_RATE = new Decimal('0.1000'); // 10%
const RETURN_WINDOW_MS = RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create an earning record for a delivered + paid order.
   * Idempotent: no-op if earning already exists for this orderId.
   */
  async createEarning(orderId: string): Promise<void> {
    // Check idempotency
    const existing = await this.prisma.sellerEarning.findUnique({
      where: { orderId },
    });
    if (existing) {
      this.logger.log(`Earning already exists for order ${orderId}, skipping`);
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        sellerId: true,
        subtotalCDF: true,
        items: {
          select: {
            product: { select: { categoryId: true } },
          },
          take: 1,
        },
        seller: {
          select: {
            sellerProfile: { select: { id: true } },
          },
        },
      },
    });

    if (!order || !order.seller?.sellerProfile) {
      this.logger.warn(
        `Cannot create earning: order ${orderId} not found or seller has no profile`,
      );
      return;
    }

    const sellerProfileId = order.seller.sellerProfile.id;
    // Commission is on the subtotal (excludes delivery fee), at the primary
    // category's rate.
    const { grossAmountCDF, commissionCDF, netAmountCDF, commissionRate } =
      await this.computeBreakdown(
        order.subtotalCDF,
        order.items[0]?.product?.categoryId ?? null,
      );

    // Create the earning. We do NOT credit walletBalanceCDF here: the seller's
    // available balance is computed lazily from earnings that have cleared the
    // return window (see getBalances / eligibleEarningWhere). The denormalized
    // walletBalanceCDF column is retained on the schema but no longer
    // authoritative for "solde disponible".
    await this.prisma.sellerEarning.create({
      data: {
        sellerProfileId,
        orderId,
        grossAmountCDF,
        commissionCDF,
        netAmountCDF,
        commissionRate,
      },
    });

    this.logger.log(
      `Earning created for order ${orderId}: gross=${grossAmountCDF}, commission=${commissionCDF} (${commissionRate}), net=${netAmountCDF}`,
    );
  }

  /**
   * Reverse a delivered order's earning when a return is approved. Runs inside
   * the caller's transaction (`tx`) so it commits atomically with the order
   * flip to RETURNED + restock.
   *
   * - No earning yet → nothing to reverse.
   * - Earning already in a payout (`isPaid`) → leave it; the cash is committed,
   *   so an admin must settle the clawback manually. Returns `inPayout: true`.
   * - Otherwise → debit the wallet by the net and delete the earning row.
   */
  async reverseEarning(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ reversed: boolean; inPayout: boolean }> {
    const earning = await tx.sellerEarning.findUnique({
      where: { orderId },
      select: { id: true, isPaid: true, payoutId: true },
    });
    if (!earning) return { reversed: false, inPayout: false };

    // An earning only becomes payout-eligible after the return window closes,
    // and returns are blocked once the window closes — so an in-payout earning
    // here is unreachable in practice. Guard it anyway: never delete money
    // that's already committed to a payout.
    if (earning.isPaid || earning.payoutId) {
      this.logger.warn(
        `Return on order ${orderId}: earning already in a payout — manual clawback required`,
      );
      return { reversed: false, inPayout: true };
    }

    // No wallet debit needed: the net was never credited (lazy model), and the
    // order is now RETURNED so the earning would be excluded from balances too.
    await tx.sellerEarning.delete({ where: { id: earning.id } });
    return { reversed: true, inPayout: false };
  }

  /**
   * Earnings that have cleared the 2-day return window and are withdrawable:
   * delivered ≥ RETURN_WINDOW_DAYS ago, order not RETURNED, not yet in a payout.
   */
  private eligibleEarningWhere(
    sellerProfileId: string,
  ): Prisma.SellerEarningWhereInput {
    const cutoff = new Date(Date.now() - RETURN_WINDOW_MS);
    return {
      sellerProfileId,
      isPaid: false,
      payoutId: null,
      order: {
        status: { not: OrderStatus.RETURNED },
        deliveredAt: { lte: cutoff },
      },
    };
  }

  /** Earnings still inside the return window (not yet withdrawable). */
  private pendingEarningWhere(
    sellerProfileId: string,
  ): Prisma.SellerEarningWhereInput {
    const cutoff = new Date(Date.now() - RETURN_WINDOW_MS);
    return {
      sellerProfileId,
      isPaid: false,
      payoutId: null,
      order: {
        status: { not: OrderStatus.RETURNED },
        deliveredAt: { gt: cutoff },
      },
    };
  }

  /**
   * Lazily-computed seller balances:
   *  - availableCDF: cleared the return window → withdrawable now
   *  - pendingCDF: still inside the return window (held)
   *  - totalEarnedCDF / totalCommissionCDF: lifetime aggregates
   */
  async getBalances(sellerProfileId: string) {
    const [available, pending, totals] = await Promise.all([
      this.prisma.sellerEarning.aggregate({
        where: this.eligibleEarningWhere(sellerProfileId),
        _sum: { netAmountCDF: true },
      }),
      this.prisma.sellerEarning.aggregate({
        where: this.pendingEarningWhere(sellerProfileId),
        _sum: { netAmountCDF: true },
      }),
      this.prisma.sellerEarning.aggregate({
        where: { sellerProfileId },
        _sum: { grossAmountCDF: true, commissionCDF: true },
      }),
    ]);
    return {
      availableCDF: available._sum.netAmountCDF ?? BigInt(0),
      pendingCDF: pending._sum.netAmountCDF ?? BigInt(0),
      totalEarnedCDF: totals._sum.grossAmountCDF ?? BigInt(0),
      totalCommissionCDF: totals._sum.commissionCDF ?? BigInt(0),
    };
  }

  /** Eligible (withdrawable) earning rows for a payout request. */
  async getEligibleEarnings(sellerProfileId: string) {
    return this.prisma.sellerEarning.findMany({
      where: this.eligibleEarningWhere(sellerProfileId),
      select: { id: true, netAmountCDF: true },
    });
  }

  /**
   * Get seller wallet summary. `balanceCDF` is the withdrawable (window-cleared)
   * amount; `pendingCDF` is held inside the 2-day return window.
   */
  async getSellerWallet(sellerProfileId: string) {
    const b = await this.getBalances(sellerProfileId);
    return {
      // balanceCDF kept = available for backward-compat with clients that read it.
      balanceCDF: String(b.availableCDF),
      availableCDF: String(b.availableCDF),
      pendingCDF: String(b.pendingCDF),
      totalEarnedCDF: String(b.totalEarnedCDF),
      totalCommissionCDF: String(b.totalCommissionCDF),
      // pendingPayoutCDF historically = unpaid-not-in-payout; now == available.
      pendingPayoutCDF: String(b.availableCDF),
    };
  }

  /**
   * List paginated earnings for a seller.
   */
  async listSellerEarnings(
    sellerProfileId: string,
    query: { page?: number; limit?: number },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.sellerEarning.findMany({
        where: { sellerProfileId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              orderNumber: true,
              totalCDF: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.sellerEarning.count({ where: { sellerProfileId } }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Commission/net breakdown for a gross (subtotal, excl. delivery) amount and
   * the order's primary category. Single source of truth for the calculation —
   * reused by `createEarning()` (the final, persisted earning on delivery) and
   * by the seller order-detail "montant à recevoir" preview (before delivery).
   */
  async computeBreakdown(
    grossAmountCDF: bigint,
    categoryId: string | null,
  ): Promise<{
    grossAmountCDF: bigint;
    commissionCDF: bigint;
    netAmountCDF: bigint;
    commissionRate: Decimal;
  }> {
    const commissionRate = categoryId
      ? await this.getCommissionRate(categoryId)
      : DEFAULT_COMMISSION_RATE;
    const commissionCDF = BigInt(
      Math.round(Number(grossAmountCDF) * commissionRate.toNumber()),
    );
    return {
      grossAmountCDF,
      commissionCDF,
      netAmountCDF: grossAmountCDF - commissionCDF,
      commissionRate,
    };
  }

  /**
   * Get effective commission rate for a category.
   * Lookup: category-specific → global → hardcoded default.
   */
  async getCommissionRate(categoryId: string): Promise<Decimal> {
    // Try category-specific rate
    const categorySetting = await this.prisma.commissionSetting.findUnique({
      where: { categoryId, isActive: true },
    });
    if (categorySetting) return categorySetting.rate;

    // Try global rate (categoryId = null)
    const globalSetting = await this.prisma.commissionSetting.findFirst({
      where: { categoryId: null, isActive: true },
    });
    if (globalSetting) return globalSetting.rate;

    // Hardcoded default
    return DEFAULT_COMMISSION_RATE;
  }
}
