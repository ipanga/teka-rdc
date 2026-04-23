import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ReportQueryDto } from './dto/report-query.dto';
import type { Response } from 'express';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Sales Report ────────────────────────────────────────────────────

  /**
   * Returns order-level sales data for admin reporting.
   * Filter by date range and sellerId.
   */
  async getSalesReport(query: ReportQueryDto) {
    const where = this.buildOrderWhere(query);

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        buyer: {
          select: { id: true, firstName: true, lastName: true },
        },
        seller: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => ({
      date: this.formatDate(order.createdAt),
      orderNumber: order.orderNumber,
      buyerName:
        `${order.buyer.firstName ?? ''} ${order.buyer.lastName ?? ''}`.trim(),
      sellerName:
        `${order.seller.firstName ?? ''} ${order.seller.lastName ?? ''}`.trim(),
      itemsCount: order.items.length,
      subtotalCDF: order.subtotalCDF.toString(),
      deliveryFeeCDF: order.deliveryFeeCDF.toString(),
      totalCDF: order.totalCDF.toString(),
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
    }));
  }

  /**
   * Streams sales report as CSV download.
   */
  async generateSalesCsv(query: ReportQueryDto, res: Response) {
    const data = await this.getSalesReport(query);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=sales-report-${this.formatDate(new Date())}.csv`,
    );

    // BOM for Excel UTF-8 compatibility
    res.write('\uFEFF');

    // Header row
    res.write(
      'Date,Order Number,Buyer,Seller,Items,Subtotal CDF,Delivery Fee CDF,Total CDF,Payment Method,Payment Status,Status\n',
    );

    for (const row of data) {
      res.write(
        `${row.date},${this.escapeCsv(row.orderNumber)},${this.escapeCsv(row.buyerName)},${this.escapeCsv(row.sellerName)},${row.itemsCount},${row.subtotalCDF},${row.deliveryFeeCDF},${row.totalCDF},${row.paymentMethod},${row.paymentStatus},${row.orderStatus}\n`,
      );
    }

    res.end();
  }

  // ─── Financial Report ────────────────────────────────────────────────

  /**
   * Returns order-level financial data with commission and earnings info.
   * Filter by date range.
   */
  async getFinancialReport(query: ReportQueryDto) {
    const where = this.buildOrderWhere(query);

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        earning: {
          select: {
            grossAmountCDF: true,
            commissionCDF: true,
            netAmountCDF: true,
            isPaid: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => ({
      date: this.formatDate(order.createdAt),
      orderNumber: order.orderNumber,
      totalCDF: order.totalCDF.toString(),
      commissionCDF: order.earning
        ? order.earning.commissionCDF.toString()
        : '0',
      sellerEarningCDF: order.earning
        ? order.earning.netAmountCDF.toString()
        : '0',
      payoutStatus: order.earning
        ? order.earning.isPaid
          ? 'PAID'
          : 'PENDING'
        : 'N/A',
    }));
  }

  /**
   * Streams financial report as CSV download.
   */
  async generateFinancialCsv(query: ReportQueryDto, res: Response) {
    const data = await this.getFinancialReport(query);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=financial-report-${this.formatDate(new Date())}.csv`,
    );

    res.write('\uFEFF');

    res.write(
      'Date,Order Number,Total CDF,Commission CDF,Seller Earning CDF,Payout Status\n',
    );

    for (const row of data) {
      res.write(
        `${row.date},${this.escapeCsv(row.orderNumber)},${row.totalCDF},${row.commissionCDF},${row.sellerEarningCDF},${row.payoutStatus}\n`,
      );
    }

    res.end();
  }

  // ─── Seller Performance Report ───────────────────────────────────────

  /**
   * Returns per-seller performance metrics.
   * Filter by date range and specific sellerId.
   */
  async getSellerPerformanceReport(query: ReportQueryDto) {
    const dateFilter = this.buildDateFilter(query);

    // Build seller filter
    const sellerWhere: Prisma.UserWhereInput = {
      role: 'SELLER',
      deletedAt: null,
    };

    if (query.sellerId) {
      sellerWhere.id = query.sellerId;
    }

    // Get all sellers
    const sellers = await this.prisma.user.findMany({
      where: sellerWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sellerProfile: {
          select: {
            businessName: true,
            avgRating: true,
            totalReviews: true,
          },
        },
      },
    });

    // For each seller, aggregate order data
    const results = await Promise.all(
      sellers.map(async (seller) => {
        const orderWhere: Prisma.OrderWhereInput = {
          sellerId: seller.id,
          deletedAt: null,
          ...dateFilter,
        };

        const [totalOrders, deliveredOrders, cancelledOrders, earnings] =
          await Promise.all([
            this.prisma.order.count({ where: orderWhere }),
            this.prisma.order.count({
              where: { ...orderWhere, status: 'DELIVERED' },
            }),
            this.prisma.order.count({
              where: { ...orderWhere, status: 'CANCELLED' },
            }),
            this.prisma.sellerEarning.aggregate({
              where: {
                sellerProfile: { userId: seller.id },
                order: { deletedAt: null, ...dateFilter },
              },
              _sum: {
                grossAmountCDF: true,
                commissionCDF: true,
              },
            }),
          ]);

        return {
          sellerName:
            `${seller.firstName ?? ''} ${seller.lastName ?? ''}`.trim(),
          businessName: seller.sellerProfile?.businessName ?? '',
          totalOrders,
          deliveredOrders,
          cancelledOrders,
          totalRevenueCDF: (
            earnings._sum.grossAmountCDF ?? BigInt(0)
          ).toString(),
          totalCommissionCDF: (
            earnings._sum.commissionCDF ?? BigInt(0)
          ).toString(),
          avgRating: seller.sellerProfile?.avgRating ?? 0,
          totalReviews: seller.sellerProfile?.totalReviews ?? 0,
        };
      }),
    );

    return results;
  }

  /**
   * Streams seller performance report as CSV download.
   */
  async generateSellerPerformanceCsv(query: ReportQueryDto, res: Response) {
    const data = await this.getSellerPerformanceReport(query);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=seller-performance-report-${this.formatDate(new Date())}.csv`,
    );

    res.write('\uFEFF');

    res.write(
      'Seller,Business Name,Total Orders,Delivered,Cancelled,Revenue CDF,Commission CDF,Avg Rating,Total Reviews\n',
    );

    for (const row of data) {
      res.write(
        `${this.escapeCsv(row.sellerName)},${this.escapeCsv(row.businessName)},${row.totalOrders},${row.deliveredOrders},${row.cancelledOrders},${row.totalRevenueCDF},${row.totalCommissionCDF},${row.avgRating},${row.totalReviews}\n`,
      );
    }

    res.end();
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  /**
   * Builds a Prisma where clause for orders based on query params.
   */
  private buildOrderWhere(query: ReportQueryDto): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
    };

    if (query.sellerId) {
      where.sellerId = query.sellerId;
    }

    const dateFilter = this.buildDateFilter(query);
    Object.assign(where, dateFilter);

    return where;
  }

  /**
   * Builds a date range filter for createdAt.
   */
  private buildDateFilter(query: ReportQueryDto): {
    createdAt?: Prisma.DateTimeFilter;
  } {
    if (!query.dateFrom && !query.dateTo) {
      return {};
    }

    const createdAt: Prisma.DateTimeFilter = {};

    if (query.dateFrom) {
      createdAt.gte = new Date(query.dateFrom);
    }

    if (query.dateTo) {
      // Set to end of day
      const endDate = new Date(query.dateTo);
      endDate.setHours(23, 59, 59, 999);
      createdAt.lte = endDate;
    }

    return { createdAt };
  }

  /**
   * Formats a Date as YYYY-MM-DD.
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Escapes a value for CSV output.
   * Wraps in double quotes if it contains commas, quotes, or newlines.
   */
  private escapeCsv(value: string): string {
    if (!value) return '';
    if (
      value.includes(',') ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r')
    ) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
