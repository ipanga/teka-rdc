import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

const DEFAULT_COMMISSION_RATE = new Decimal('0.1000'); // 10%

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
    const grossAmountCDF = order.subtotalCDF; // Excluding delivery fee

    // Get commission rate for the primary category
    const categoryId = order.items[0]?.product?.categoryId;
    const commissionRate = categoryId
      ? await this.getCommissionRate(categoryId)
      : DEFAULT_COMMISSION_RATE;

    // Calculate commission and net amounts
    const commissionCDF = BigInt(
      Math.round(Number(grossAmountCDF) * commissionRate.toNumber()),
    );
    const netAmountCDF = grossAmountCDF - commissionCDF;

    // Create earning + update wallet balance atomically
    await this.prisma.$transaction(async (tx) => {
      await tx.sellerEarning.create({
        data: {
          sellerProfileId,
          orderId,
          grossAmountCDF,
          commissionCDF,
          netAmountCDF,
          commissionRate,
        },
      });

      await tx.sellerProfile.update({
        where: { id: sellerProfileId },
        data: {
          walletBalanceCDF: { increment: netAmountCDF },
        },
      });
    });

    this.logger.log(
      `Earning created for order ${orderId}: gross=${grossAmountCDF}, commission=${commissionCDF} (${commissionRate}), net=${netAmountCDF}`,
    );
  }

  /**
   * Get seller wallet summary.
   */
  async getSellerWallet(sellerProfileId: string) {
    const [profile, aggregates] = await Promise.all([
      this.prisma.sellerProfile.findUnique({
        where: { id: sellerProfileId },
        select: { walletBalanceCDF: true },
      }),
      this.prisma.sellerEarning.aggregate({
        where: { sellerProfileId },
        _sum: {
          grossAmountCDF: true,
          commissionCDF: true,
          netAmountCDF: true,
        },
      }),
    ]);

    // Pending payout = unpaid earnings not yet in a payout request
    const pendingPayout = await this.prisma.sellerEarning.aggregate({
      where: { sellerProfileId, isPaid: false, payoutId: null },
      _sum: { netAmountCDF: true },
    });

    return {
      balanceCDF: String(profile?.walletBalanceCDF ?? BigInt(0)),
      totalEarnedCDF: String(aggregates._sum.grossAmountCDF ?? BigInt(0)),
      totalCommissionCDF: String(aggregates._sum.commissionCDF ?? BigInt(0)),
      pendingPayoutCDF: String(pendingPayout._sum.netAmountCDF ?? BigInt(0)),
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
