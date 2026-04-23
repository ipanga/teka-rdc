import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PayoutStatus } from '@prisma/client';

export interface DashboardStats {
  totalUsers: number;
  totalSellers: number;
  totalOrders: number;
  totalRevenueCDF: string;
  totalCommissionCDF: string;
  pendingPayoutsCount: number;
  pendingPayoutsAmountCDF: string;
  ordersThisMonth: number;
  revenueThisMonthCDF: string;
}

export type TrendPeriod = '7d' | '30d' | '90d';

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

@Injectable()
export class AdminStatsService {
  private readonly logger = new Logger(AdminStatsService.name);

  constructor(private prisma: PrismaService) {}

  async getDashboardStats(): Promise<{ success: true; data: DashboardStats }> {
    // Calculate the first day of the current month (UTC)
    const now = new Date();
    const firstDayOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    const [
      totalUsers,
      totalSellers,
      totalOrders,
      totalRevenueAgg,
      totalCommissionAgg,
      pendingPayoutsAgg,
      ordersThisMonth,
      revenueThisMonthAgg,
    ] = await Promise.all([
      // Total active users (non-deleted)
      this.prisma.user.count({
        where: { deletedAt: null },
      }),

      // Total approved sellers
      this.prisma.sellerProfile.count({
        where: {
          applicationStatus: 'APPROVED',
          deletedAt: null,
        },
      }),

      // Total orders (non-deleted)
      this.prisma.order.count({
        where: { deletedAt: null },
      }),

      // Total revenue from DELIVERED orders (sum of totalCDF)
      this.prisma.order.aggregate({
        _sum: { totalCDF: true },
        where: {
          status: OrderStatus.DELIVERED,
          deletedAt: null,
        },
      }),

      // Total commission from SellerEarning
      this.prisma.sellerEarning.aggregate({
        _sum: { commissionCDF: true },
      }),

      // Pending payouts (count + sum)
      this.prisma.payout.aggregate({
        _count: true,
        _sum: { amountCDF: true },
        where: {
          status: PayoutStatus.REQUESTED,
        },
      }),

      // Orders this month
      this.prisma.order.count({
        where: {
          deletedAt: null,
          createdAt: { gte: firstDayOfMonth },
        },
      }),

      // Revenue this month (DELIVERED orders)
      this.prisma.order.aggregate({
        _sum: { totalCDF: true },
        where: {
          status: OrderStatus.DELIVERED,
          deletedAt: null,
          createdAt: { gte: firstDayOfMonth },
        },
      }),
    ]);

    const stats: DashboardStats = {
      totalUsers,
      totalSellers,
      totalOrders,
      totalRevenueCDF: (totalRevenueAgg._sum.totalCDF ?? BigInt(0)).toString(),
      totalCommissionCDF: (
        totalCommissionAgg._sum.commissionCDF ?? BigInt(0)
      ).toString(),
      pendingPayoutsCount: pendingPayoutsAgg._count,
      pendingPayoutsAmountCDF: (
        pendingPayoutsAgg._sum.amountCDF ?? BigInt(0)
      ).toString(),
      ordersThisMonth,
      revenueThisMonthCDF: (
        revenueThisMonthAgg._sum.totalCDF ?? BigInt(0)
      ).toString(),
    };

    return { success: true, data: stats };
  }

  async getDashboardTrends(
    period: TrendPeriod,
  ): Promise<{ success: true; data: DashboardTrends }> {
    // Calculate start date based on period
    const now = new Date();
    const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysBack);
    startDate.setUTCHours(0, 0, 0, 0);

    // Revenue daily: sum of totalCDF from DELIVERED orders grouped by day
    const revenueDaily = await this.prisma.$queryRaw<
      { date: Date; value: bigint }[]
    >`
      SELECT date_trunc('day', "createdAt") AS date,
             COALESCE(SUM("totalCDF"), 0) AS value
        FROM orders
       WHERE status = 'DELIVERED'
         AND "deletedAt" IS NULL
         AND "createdAt" >= ${startDate}
       GROUP BY date_trunc('day', "createdAt")
       ORDER BY date ASC
    `;

    // Orders daily: count of all orders per day
    const ordersDaily = await this.prisma.$queryRaw<
      { date: Date; value: bigint }[]
    >`
      SELECT date_trunc('day', "createdAt") AS date,
             COUNT(*)::bigint AS value
        FROM orders
       WHERE "deletedAt" IS NULL
         AND "createdAt" >= ${startDate}
       GROUP BY date_trunc('day', "createdAt")
       ORDER BY date ASC
    `;

    // Users daily: new user registrations per day
    const usersDaily = await this.prisma.$queryRaw<
      { date: Date; value: bigint }[]
    >`
      SELECT date_trunc('day', "createdAt") AS date,
             COUNT(*)::bigint AS value
        FROM users
       WHERE "deletedAt" IS NULL
         AND "createdAt" >= ${startDate}
       GROUP BY date_trunc('day', "createdAt")
       ORDER BY date ASC
    `;

    // GMV daily: sum of totalCDF from all non-cancelled orders per day
    const gmvDaily = await this.prisma.$queryRaw<
      { date: Date; value: bigint }[]
    >`
      SELECT date_trunc('day', "createdAt") AS date,
             COALESCE(SUM("totalCDF"), 0) AS value
        FROM orders
       WHERE status != 'CANCELLED'
         AND "deletedAt" IS NULL
         AND "createdAt" >= ${startDate}
       GROUP BY date_trunc('day', "createdAt")
       ORDER BY date ASC
    `;

    // Convert raw results to TrendDataPoint arrays
    const formatResults = (
      rows: { date: Date; value: bigint }[],
    ): TrendDataPoint[] =>
      rows.map((row) => ({
        date: row.date.toISOString().split('T')[0],
        value: Number(row.value),
      }));

    const trends: DashboardTrends = {
      revenueDaily: formatResults(revenueDaily),
      ordersDaily: formatResults(ordersDaily),
      usersDaily: formatResults(usersDaily),
      gmvDaily: formatResults(gmvDaily),
    };

    return { success: true, data: trends };
  }
}
