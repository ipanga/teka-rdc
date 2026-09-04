import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, OrderStatus, CommissionSource } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { RETURN_WINDOW_DAYS } from '../orders/order-workflow.constants';
import {
  blendedRate,
  commissionFor,
  rateToUnits,
  unitsToRate,
} from './commission-math';

const RETURN_WINDOW_MS = RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Prisma client or interactive-transaction client — every read/write here accepts either. */
type Db = PrismaService | Prisma.TransactionClient;

/** One resolved commission rule. */
export interface ResolvedCommission {
  /** Ten-thousandths of the rate (0 … 10 000). */
  units: bigint;
  rate: Decimal;
  source: CommissionSource;
  /** SellerProfile.id, CommissionSetting.id — whatever produced the rate. */
  ruleId: string;
}

export interface BreakdownItem {
  id?: string;
  totalCDF: bigint;
  categoryId: string | null;
}

export interface CommissionBreakdown {
  grossAmountCDF: bigint;
  commissionCDF: bigint;
  netAmountCDF: bigint;
  /** Exact when every line shares one rule, otherwise the blended rate (display only). */
  commissionRate: Decimal;
  /** SELLER | CATEGORY | GLOBAL, or MIXED when lines resolved differently. */
  commissionSource: CommissionSource;
  items: Array<
    BreakdownItem & {
      commissionCDF: bigint;
      commissionRate: Decimal;
      commissionSource: CommissionSource;
      commissionRuleId: string;
    }
  >;
}

/** Thrown when no commission rule can be resolved (no global setting). */
export class CommissionNotConfiguredError extends Error {
  constructor() {
    super(
      'Aucun taux de commission global actif n’est configuré. Configurez-le dans Administration → Commissions avant de livrer des commandes.',
    );
    this.name = 'CommissionNotConfiguredError';
  }
}

export type EarningReversalReason = 'RETURN_APPROVED' | 'ORDER_STATUS_FORCED';

/**
 * Seller earnings ledger.
 *
 * COD invariant: a seller earning exists only once Teka has DELIVERED the
 * order and collected the cash (`createEarning` is called from
 * `markDelivered`, inside its transaction). Nothing earlier in the lifecycle
 * creates a withdrawable balance.
 *
 * Balances are computed on read from the rows (no wallet column). A row is
 *   HELD       inside the 2-day return window,
 *   AVAILABLE  once the window closed and the order is still DELIVERED,
 *   RESERVED   while linked to an open payout,
 *   REVERSED   when the sale was returned / forcibly cancelled (kept, never
 *              deleted — `reversedAt` explains it).
 */
@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Commission resolution (D3 precedence) + per-item calculation (D5)
  // ---------------------------------------------------------------------------

  /**
   * Resolve the rule for one (seller, leaf category) pair:
   *   1. active seller-specific override (`SellerProfile.commissionRate`)
   *   2. active leaf-category `CommissionSetting`
   *   3. active global `CommissionSetting` (categoryId IS NULL)
   * There is deliberately no hardcoded fallback: a missing global setting is a
   * configuration error surfaced as `CommissionNotConfiguredError`.
   */
  async resolveCommission(
    sellerProfileId: string,
    categoryId: string | null,
    db: Db = this.prisma,
  ): Promise<ResolvedCommission> {
    const profile = await db.sellerProfile.findUnique({
      where: { id: sellerProfileId },
      select: { id: true, commissionRate: true },
    });
    if (profile?.commissionRate != null) {
      return this.resolved(
        profile.commissionRate,
        CommissionSource.SELLER,
        profile.id,
      );
    }

    if (categoryId) {
      const categorySetting = await db.commissionSetting.findFirst({
        where: { categoryId, isActive: true },
        select: { id: true, rate: true },
      });
      if (categorySetting) {
        return this.resolved(
          categorySetting.rate,
          CommissionSource.CATEGORY,
          categorySetting.id,
        );
      }
    }

    const globalSetting = await db.commissionSetting.findFirst({
      where: { categoryId: null, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, rate: true },
    });
    if (globalSetting) {
      return this.resolved(
        globalSetting.rate,
        CommissionSource.GLOBAL,
        globalSetting.id,
      );
    }

    throw new CommissionNotConfiguredError();
  }

  private resolved(
    rate: Decimal,
    source: CommissionSource,
    ruleId: string,
  ): ResolvedCommission {
    const units = rateToUnits(rate);
    return { units, rate: unitsToRate(units), source, ruleId };
  }

  /**
   * Per-item commission (D5): each line is charged at its own resolved rule,
   * amounts are summed, and the earning-level rate is exact when every line
   * shares one rule or blended otherwise. Integer arithmetic throughout.
   *
   * Used both for the final earning (delivery) and for the "à recevoir"
   * projection shown before delivery.
   */
  async computeBreakdown(
    sellerProfileId: string,
    items: BreakdownItem[],
    db: Db = this.prisma,
  ): Promise<CommissionBreakdown> {
    const cache = new Map<string, ResolvedCommission>();
    const resolve = async (categoryId: string | null) => {
      const key = categoryId ?? '';
      let r = cache.get(key);
      if (!r) {
        r = await this.resolveCommission(sellerProfileId, categoryId, db);
        cache.set(key, r);
      }
      return r;
    };

    let grossAmountCDF = 0n;
    let commissionCDF = 0n;
    const out: CommissionBreakdown['items'] = [];
    for (const item of items) {
      const rule = await resolve(item.categoryId);
      const c = commissionFor(item.totalCDF, rule.units);
      grossAmountCDF += item.totalCDF;
      commissionCDF += c;
      out.push({
        ...item,
        commissionCDF: c,
        commissionRate: rule.rate,
        commissionSource: rule.source,
        commissionRuleId: rule.ruleId,
      });
    }

    const rules = new Set(out.map((i) => i.commissionRuleId));
    const sources = new Set(out.map((i) => i.commissionSource));
    const single = rules.size === 1 ? out[0] : null;

    return {
      grossAmountCDF,
      commissionCDF,
      netAmountCDF: grossAmountCDF - commissionCDF,
      commissionRate: single
        ? single.commissionRate
        : blendedRate(commissionCDF, grossAmountCDF),
      commissionSource:
        sources.size === 1 ? out[0].commissionSource : CommissionSource.MIXED,
      items: out,
    };
  }

  // ---------------------------------------------------------------------------
  // Ledger writes
  // ---------------------------------------------------------------------------

  /**
   * Create the earning for a DELIVERED order and snapshot the commission on
   * every line (D4: rate resolved at delivery; later configuration changes
   * never touch this row). Idempotent on `orderId`. Runs on `db` — pass the
   * delivery transaction so the earning commits with the status flip.
   */
  async createEarning(orderId: string, db: Db = this.prisma): Promise<void> {
    const existing = await db.sellerEarning.findUnique({
      where: { orderId },
      select: { id: true },
    });
    if (existing) {
      this.logger.log(`Earning already exists for order ${orderId}, skipping`);
      return;
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        sellerId: true,
        subtotalCDF: true,
        items: {
          select: {
            id: true,
            totalCDF: true,
            product: { select: { categoryId: true } },
          },
        },
        seller: { select: { sellerProfile: { select: { id: true } } } },
      },
    });

    if (!order || !order.seller?.sellerProfile) {
      this.logger.warn(
        `Cannot create earning: order ${orderId} not found or seller has no profile`,
      );
      return;
    }

    const sellerProfileId = order.seller.sellerProfile.id;
    const b = await this.computeBreakdown(
      sellerProfileId,
      order.items.map((i) => ({
        id: i.id,
        totalCDF: i.totalCDF,
        categoryId: i.product?.categoryId ?? null,
      })),
      db,
    );

    if (b.grossAmountCDF !== order.subtotalCDF) {
      // Commission is on the goods (subtotal excludes delivery). The line totals
      // are the authoritative base; log a mismatch rather than hide it.
      this.logger.warn(
        `Order ${orderId}: subtotal ${order.subtotalCDF} ≠ Σ items ${b.grossAmountCDF}; commission computed on the line totals`,
      );
    }

    await db.sellerEarning.create({
      data: {
        sellerProfileId,
        orderId,
        grossAmountCDF: b.grossAmountCDF,
        commissionCDF: b.commissionCDF,
        netAmountCDF: b.netAmountCDF,
        commissionRate: b.commissionRate,
        commissionSource: b.commissionSource,
      },
    });

    for (const item of b.items) {
      if (!item.id) continue;
      await db.orderItem.update({
        where: { id: item.id },
        data: {
          commissionRate: item.commissionRate,
          commissionCDF: item.commissionCDF,
          commissionSource: item.commissionSource,
          commissionRuleId: item.commissionRuleId,
        },
      });
    }

    this.logger.log(
      `Earning created for order ${orderId}: gross=${b.grossAmountCDF}, commission=${b.commissionCDF} (${b.commissionRate}, ${b.commissionSource}), net=${b.netAmountCDF}`,
    );
  }

  /**
   * Reverse an order's earning (return approved, or an admin forced the order
   * out of DELIVERED). Runs inside the caller's transaction.
   *
   * - No earning → nothing to do.
   * - Already reversed → no-op (idempotent).
   * - Reserved in a payout → the cash is committed: stamp `clawbackRequiredAt`
   *   so finance can settle it by hand; the row stays reserved.
   * - Otherwise → stamp `reversedAt` + reason. The row is KEPT (D6): balances,
   *   totals and reports exclude it, history explains it.
   */
  async reverseEarning(
    orderId: string,
    tx: Prisma.TransactionClient,
    reason: EarningReversalReason = 'RETURN_APPROVED',
  ): Promise<{ reversed: boolean; inPayout: boolean }> {
    const earning = await tx.sellerEarning.findUnique({
      where: { orderId },
      select: {
        id: true,
        isPaid: true,
        payoutId: true,
        reversedAt: true,
        clawbackRequiredAt: true,
      },
    });
    if (!earning) return { reversed: false, inPayout: false };
    if (earning.reversedAt) return { reversed: true, inPayout: false };

    if (earning.isPaid || earning.payoutId) {
      if (!earning.clawbackRequiredAt) {
        await tx.sellerEarning.update({
          where: { id: earning.id },
          data: { clawbackRequiredAt: new Date(), reversalReason: reason },
        });
      }
      this.logger.warn(
        `Reversal on order ${orderId}: earning already reserved in payout ${earning.payoutId} — manual clawback required`,
      );
      return { reversed: false, inPayout: true };
    }

    await tx.sellerEarning.update({
      where: { id: earning.id },
      data: { reversedAt: new Date(), reversalReason: reason },
    });
    return { reversed: true, inPayout: false };
  }

  // ---------------------------------------------------------------------------
  // Balances (computed on read)
  // ---------------------------------------------------------------------------

  /** Rows that still count: not reversed. */
  private liveWhere(sellerProfileId: string): Prisma.SellerEarningWhereInput {
    return { sellerProfileId, reversedAt: null };
  }

  /**
   * Withdrawable now: window closed, order STILL DELIVERED (D6 — a returned or
   * forcibly cancelled sale drops out), not reversed, not reserved.
   */
  private eligibleEarningWhere(
    sellerProfileId: string,
  ): Prisma.SellerEarningWhereInput {
    const cutoff = new Date(Date.now() - RETURN_WINDOW_MS);
    return {
      ...this.liveWhere(sellerProfileId),
      isPaid: false,
      payoutId: null,
      order: { status: OrderStatus.DELIVERED, deliveredAt: { lte: cutoff } },
    };
  }

  /** Held inside the return window. */
  private pendingEarningWhere(
    sellerProfileId: string,
  ): Prisma.SellerEarningWhereInput {
    const cutoff = new Date(Date.now() - RETURN_WINDOW_MS);
    return {
      ...this.liveWhere(sellerProfileId),
      isPaid: false,
      payoutId: null,
      order: { status: OrderStatus.DELIVERED, deliveredAt: { gt: cutoff } },
    };
  }

  async getBalances(sellerProfileId: string, db: Db = this.prisma) {
    const [available, pending, totals] = await Promise.all([
      db.sellerEarning.aggregate({
        where: this.eligibleEarningWhere(sellerProfileId),
        _sum: { netAmountCDF: true },
      }),
      db.sellerEarning.aggregate({
        where: this.pendingEarningWhere(sellerProfileId),
        _sum: { netAmountCDF: true },
      }),
      db.sellerEarning.aggregate({
        where: this.liveWhere(sellerProfileId),
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

  /** Eligible (withdrawable) earning rows — pass the payout transaction to read under its lock. */
  async getEligibleEarnings(sellerProfileId: string, db: Db = this.prisma) {
    return db.sellerEarning.findMany({
      where: this.eligibleEarningWhere(sellerProfileId),
      select: { id: true, netAmountCDF: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Seller wallet summary. Field names are frozen — installed mobile builds
   * read them. `balanceCDF` and `pendingPayoutCDF` both equal the available
   * amount for backward compatibility.
   */
  async getSellerWallet(sellerProfileId: string) {
    const b = await this.getBalances(sellerProfileId);
    return {
      balanceCDF: String(b.availableCDF),
      availableCDF: String(b.availableCDF),
      pendingCDF: String(b.pendingCDF),
      totalEarnedCDF: String(b.totalEarnedCDF),
      totalCommissionCDF: String(b.totalCommissionCDF),
      pendingPayoutCDF: String(b.availableCDF),
    };
  }

  /** Paginated earnings for a seller (reversed rows included — history is visible, flagged by `reversedAt`). */
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
            select: { orderNumber: true, totalCDF: true, createdAt: true },
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
}
