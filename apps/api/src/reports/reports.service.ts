import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  ReportQueryDto,
  REPORT_DEFAULT_LIMIT,
  REPORT_MAX_LIMIT,
} from './dto/report-query.dto';
import {
  CSV_MAX_ROWS,
  csvNumber,
  csvText,
  writeCsvResponse,
} from '../common/utils/csv.util';
import { windowFilterFor } from './report-window.util';
import type { Response } from 'express';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Resolves the page window. The DTO already bounds these, but the service is
   * also called from tests and future internal callers, so it clamps again
   * rather than trusting its input.
   */
  private resolvePage(query: ReportQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      Math.max(query.limit ?? REPORT_DEFAULT_LIMIT, 1),
      REPORT_MAX_LIMIT,
    );
    return { page, limit, skip: (page - 1) * limit, take: limit };
  }

  private paginate<T>(data: T[], total: number, page: number, limit: number) {
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Sales Report ────────────────────────────────────────────────────

  /**
   * Returns order-level sales data for admin reporting.
   * Filter by date range and sellerId.
   */
  async getSalesReport(query: ReportQueryDto) {
    const { page, limit, skip, take } = this.resolvePage(query);
    const where = this.buildOrderWhere(query);
    const [rows, total] = await Promise.all([
      this.collectSalesRows(where, skip, take),
      this.prisma.order.count({ where }),
    ]);
    return this.paginate(rows, total, page, limit);
  }

  /**
   * Fetches sales rows for an explicit window. Kept separate from
   * `getSalesReport` so the CSV export can pull the whole filtered set (capped
   * by CSV_MAX_ROWS) instead of a single JSON page.
   *
   * `_count.items` replaces the previous `include: { items: { select: { id } } }`,
   * which loaded every order-item row purely to call `.length` on it.
   */
  private async collectSalesRows(
    where: Prisma.OrderWhereInput,
    skip: number,
    take: number,
  ) {
    const orders = await this.prisma.order.findMany({
      where,
      include: {
        buyer: {
          select: { id: true, firstName: true, lastName: true },
        },
        seller: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    return orders.map((order) => ({
      date: this.formatDate(order.createdAt),
      orderNumber: order.orderNumber,
      buyerName:
        `${order.buyer.firstName ?? ''} ${order.buyer.lastName ?? ''}`.trim(),
      sellerName:
        `${order.seller.firstName ?? ''} ${order.seller.lastName ?? ''}`.trim(),
      itemsCount: order._count.items,
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
    const data = await this.collectSalesRows(
      this.buildOrderWhere(query),
      0,
      CSV_MAX_ROWS + 1,
    );

    writeCsvResponse(res, {
      filename: `sales-report-${this.formatDate(new Date())}.csv`,
      headers: [
        'Date', 'Order Number', 'Buyer', 'Seller', 'Items', 'Subtotal CDF',
        'Delivery Fee CDF', 'Total CDF', 'Payment Method', 'Payment Status',
        'Status',
      ],
      rows: data.map((row) => [
        csvText(row.date),
        csvText(row.orderNumber),
        csvText(row.buyerName),
        csvText(row.sellerName),
        csvNumber(row.itemsCount),
        csvNumber(row.subtotalCDF),
        csvNumber(row.deliveryFeeCDF),
        csvNumber(row.totalCDF),
        csvText(row.paymentMethod),
        csvText(row.paymentStatus),
        csvText(row.orderStatus),
      ]),
    });
  }

  // ─── Financial Report ────────────────────────────────────────────────

  /**
   * Returns order-level financial data with commission and earnings info.
   * Filter by date range.
   */
  async getFinancialReport(query: ReportQueryDto) {
    const { page, limit, skip, take } = this.resolvePage(query);
    const where = this.buildOrderWhere(query);
    const [rows, total] = await Promise.all([
      this.collectFinancialRows(where, skip, take),
      this.prisma.order.count({ where }),
    ]);
    return this.paginate(rows, total, page, limit);
  }

  private async collectFinancialRows(
    where: Prisma.OrderWhereInput,
    skip: number,
    take: number,
  ) {
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
      skip,
      take,
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
    const data = await this.collectFinancialRows(
      this.buildOrderWhere(query),
      0,
      CSV_MAX_ROWS + 1,
    );

    writeCsvResponse(res, {
      filename: `financial-report-${this.formatDate(new Date())}.csv`,
      headers: [
        'Date', 'Order Number', 'Total CDF', 'Commission CDF',
        'Seller Earning CDF', 'Payout Status',
      ],
      rows: data.map((row) => [
        csvText(row.date),
        csvText(row.orderNumber),
        csvNumber(row.totalCDF),
        csvNumber(row.commissionCDF),
        csvNumber(row.sellerEarningCDF),
        csvText(row.payoutStatus),
      ]),
    });
  }

  // ─── Seller Performance Report ───────────────────────────────────────

  /**
   * Returns per-seller performance metrics.
   * Filter by date range and specific sellerId.
   */
  async getSellerPerformanceReport(query: ReportQueryDto) {
    const { page, limit, skip, take } = this.resolvePage(query);
    const sellerWhere = this.buildSellerWhere(query);
    const [rows, total] = await Promise.all([
      this.collectSellerPerformanceRows(sellerWhere, query, skip, take),
      this.prisma.user.count({ where: sellerWhere }),
    ]);
    return this.paginate(rows, total, page, limit);
  }

  private buildSellerWhere(query: ReportQueryDto): Prisma.UserWhereInput {
    return {
      role: 'SELLER',
      deletedAt: null,
      ...(query.sellerId ? { id: query.sellerId } : {}),
    };
  }

  /**
   * Per-seller performance metrics.
   *
   * This used to issue FOUR queries per seller inside a `Promise.all` over an
   * unbounded seller list — three `order.count`s and one `sellerEarning.
   * aggregate` — so the query count grew linearly with the marketplace. It now
   * runs a fixed FOUR queries in total (count + page + two groupBys) no matter
   * how many sellers there are; `reports.service.spec.ts` guards that with an
   * explicit call-count assertion.
   *
   * Ordering is pinned to `createdAt desc` because pagination over an unordered
   * `findMany` can repeat or skip rows between pages.
   */
  private async collectSellerPerformanceRows(
    sellerWhere: Prisma.UserWhereInput,
    query: ReportQueryDto,
    skip: number,
    take: number,
  ) {
    const sellers = await this.prisma.user.findMany({
      where: sellerWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sellerProfile: {
          select: {
            id: true,
            businessName: true,
            avgRating: true,
            totalReviews: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    if (sellers.length === 0) return [];

    const sellerIds = sellers.map((s) => s.id);
    const profileIds = sellers
      .map((s) => s.sellerProfile?.id)
      .filter((id): id is string => Boolean(id));

    // The seller report is an activity view, so it stays on `createdAt` (when
    // the order was placed). Delivered-revenue semantics live in the sales
    // analytics endpoints, which key on `deliveredAt`.
    const orderWindow = windowFilterFor(
      'createdAt',
      query.dateFrom,
      query.dateTo,
    );

    const [statusCounts, earnings] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['sellerId', 'status'],
        where: { sellerId: { in: sellerIds }, deletedAt: null, ...orderWindow },
        _count: { _all: true },
      }),
      profileIds.length > 0
        ? this.prisma.sellerEarning.groupBy({
            by: ['sellerProfileId'],
            where: {
              sellerProfileId: { in: profileIds },
              order: { deletedAt: null, ...orderWindow },
            },
            _sum: { grossAmountCDF: true, commissionCDF: true },
          })
        : Promise.resolve([]),
    ]);

    const counts = new Map<
      string,
      { total: number; delivered: number; cancelled: number }
    >();
    for (const row of statusCounts) {
      const entry = counts.get(row.sellerId) ?? {
        total: 0,
        delivered: 0,
        cancelled: 0,
      };
      const n = row._count._all;
      entry.total += n;
      if (row.status === 'DELIVERED') entry.delivered += n;
      if (row.status === 'CANCELLED') entry.cancelled += n;
      counts.set(row.sellerId, entry);
    }

    const money = new Map(
      earnings.map((e) => [
        e.sellerProfileId,
        {
          gross: e._sum.grossAmountCDF ?? BigInt(0),
          commission: e._sum.commissionCDF ?? BigInt(0),
        },
      ]),
    );

    return sellers.map((seller) => {
      const c = counts.get(seller.id) ?? {
        total: 0,
        delivered: 0,
        cancelled: 0,
      };
      const m = seller.sellerProfile?.id
        ? money.get(seller.sellerProfile.id)
        : undefined;
      return {
        sellerName:
          `${seller.firstName ?? ''} ${seller.lastName ?? ''}`.trim(),
        businessName: seller.sellerProfile?.businessName ?? '',
        totalOrders: c.total,
        deliveredOrders: c.delivered,
        cancelledOrders: c.cancelled,
        totalRevenueCDF: (m?.gross ?? BigInt(0)).toString(),
        totalCommissionCDF: (m?.commission ?? BigInt(0)).toString(),
        avgRating: seller.sellerProfile?.avgRating ?? 0,
        totalReviews: seller.sellerProfile?.totalReviews ?? 0,
      };
    });
  }

  /**
   * Streams seller performance report as CSV download.
   */
  async generateSellerPerformanceCsv(query: ReportQueryDto, res: Response) {
    const data = await this.collectSellerPerformanceRows(
      this.buildSellerWhere(query),
      query,
      0,
      CSV_MAX_ROWS + 1,
    );

    writeCsvResponse(res, {
      filename: `seller-performance-report-${this.formatDate(new Date())}.csv`,
      headers: [
        'Seller', 'Business Name', 'Total Orders', 'Delivered', 'Cancelled',
        'Revenue CDF', 'Commission CDF', 'Avg Rating', 'Total Reviews',
      ],
      rows: data.map((row) => [
        csvText(row.sellerName),
        csvText(row.businessName),
        csvNumber(row.totalOrders),
        csvNumber(row.deliveredOrders),
        csvNumber(row.cancelledOrders),
        csvNumber(row.totalRevenueCDF),
        csvNumber(row.totalCommissionCDF),
        csvNumber(row.avgRating),
        csvNumber(row.totalReviews),
      ]),
    });
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  /**
   * Builds a Prisma where clause for orders based on query params.
   */
  private buildOrderWhere(query: ReportQueryDto): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      // The order LEDGER is keyed on when the order was placed. Completed-sale
      // semantics (DELIVERED, on `deliveredAt`) belong to the sales analytics
      // endpoints, not here — a ledger legitimately lists cancelled orders.
      ...windowFilterFor('createdAt', query.dateFrom, query.dateTo),
    };

    if (query.sellerId) {
      where.sellerId = query.sellerId;
    }

    return where;
  }

  /**
   * Formats a Date as YYYY-MM-DD.
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // ─── Payouts Report ──────────────────────────────────────────────────

  /**
   * Returns payout-level data for finance reconciliation. Filter by date range
   * (on the payout's createdAt) and sellerId (the seller's User id).
   */
  async getPayoutsReport(query: ReportQueryDto) {
    const { page, limit, skip, take } = this.resolvePage(query);
    const where = this.buildPayoutWhere(query);
    const [rows, total] = await Promise.all([
      this.collectPayoutRows(where, skip, take),
      this.prisma.payout.count({ where }),
    ]);
    return this.paginate(rows, total, page, limit);
  }

  private buildPayoutWhere(query: ReportQueryDto): Prisma.PayoutWhereInput {
    const where: Prisma.PayoutWhereInput = {
      // The payout's own createdAt — not the order's.
      ...windowFilterFor('createdAt', query.dateFrom, query.dateTo),
    };
    if (query.sellerId) {
      where.sellerProfile = { userId: query.sellerId };
    }
    return where;
  }

  private async collectPayoutRows(
    where: Prisma.PayoutWhereInput,
    skip: number,
    take: number,
  ) {
    const payouts = await this.prisma.payout.findMany({
      where,
      include: {
        sellerProfile: {
          select: {
            businessName: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    return payouts.map((p) => ({
      date: this.formatDate(p.createdAt),
      sellerName:
        `${p.sellerProfile?.user?.firstName ?? ''} ${p.sellerProfile?.user?.lastName ?? ''}`.trim(),
      businessName: p.sellerProfile?.businessName ?? '',
      amountCDF: p.amountCDF.toString(),
      method: p.payoutMethod,
      phone: p.payoutPhone,
      status: p.status,
      reference: p.externalReference ?? '',
      processedAt: p.processedAt ? this.formatDate(p.processedAt) : '',
      rejectionReason: p.rejectionReason ?? '',
    }));
  }

  /**
   * Streams the payouts report as a CSV download for finance reconciliation.
   */
  async generatePayoutsCsv(query: ReportQueryDto, res: Response) {
    const data = await this.collectPayoutRows(
      this.buildPayoutWhere(query),
      0,
      CSV_MAX_ROWS + 1,
    );

    writeCsvResponse(res, {
      filename: `payouts-report-${this.formatDate(new Date())}.csv`,
      headers: [
        'Date', 'Seller', 'Business', 'Amount CDF', 'Method', 'Phone', 'Status',
        'Reference', 'Processed At', 'Rejection Reason',
      ],
      // `phone` is a +243… number. csvText neutralises the leading `+`, which
      // Excel would otherwise evaluate as a formula and render as the bare
      // integer 243970000001 — so this also fixes a long-standing display bug.
      rows: data.map((row) => [
        csvText(row.date),
        csvText(row.sellerName),
        csvText(row.businessName),
        csvNumber(row.amountCDF),
        csvText(row.method),
        csvText(row.phone),
        csvText(row.status),
        csvText(row.reference),
        csvText(row.processedAt),
        csvText(row.rejectionReason),
      ]),
    });
  }
}
