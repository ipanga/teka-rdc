import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  TransactionType,
  TransactionProvider,
  PaymentStatus,
  PaymentMethod,
} from '@prisma/client';
import { TransactionQueryDto } from './dto/transaction-query.dto';

/**
 * Transaction persistence for the COD-only payment model (since
 * 2026-05-26, PR B2). No external provider call sites remain — the
 * platform writes COD Transaction rows on order create and marks them
 * COMPLETED when the seller marks delivery.
 *
 * `TransactionProvider.FLEXPAY` stays on the Prisma enum because legacy
 * rows reference it; new rows are always `COD` (or `MANUAL` for
 * operator-driven adjustments).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a COD transaction record for an order.
   */
  async createCodTransaction(
    orderId: string,
    amountCDF: bigint,
    amountUSD: bigint | null,
  ) {
    return this.prisma.transaction.create({
      data: {
        orderId,
        type: TransactionType.PAYMENT,
        provider: TransactionProvider.COD,
        amountCDF,
        amountUSD,
        currency: 'CDF',
        status: PaymentStatus.PENDING,
        externalReference: `COD-${orderId.slice(0, 8)}`,
      },
    });
  }

  /**
   * Complete a COD transaction (called when order is delivered).
   */
  async completeCodTransaction(
    orderId: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const transaction = await db.transaction.findFirst({
      where: {
        orderId,
        type: TransactionType.PAYMENT,
        provider: TransactionProvider.COD,
      },
    });

    if (transaction && transaction.status !== PaymentStatus.COMPLETED) {
      await db.transaction.update({
        where: { id: transaction.id },
        data: { status: PaymentStatus.COMPLETED },
      });
    }
  }

  /**
   * D7 — a COD order cancelled before the cash was collected: the payment
   * will never happen. Flips `Order.paymentStatus` PENDING → FAILED and the
   * order's COD PAYMENT transaction PENDING/PROCESSING → FAILED
   * (`failureReason: 'order_cancelled'`) inside the caller's cancellation
   * transaction. Returns whether the flip happened so the caller emits
   * `payment_failed` exactly once. A payment already COMPLETED / REFUNDED /
   * FAILED, or a non-COD order, is never touched — and no refund is created,
   * because no money moved. Conditional update → idempotent under retries.
   */
  async failCodPaymentOnCancellation(
    order: { id: string; paymentMethod: PaymentMethod; paymentStatus: PaymentStatus },
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    if (order.paymentMethod !== PaymentMethod.COD) return false;
    if (order.paymentStatus !== PaymentStatus.PENDING) return false;

    const flipped = await db.order.updateMany({
      where: { id: order.id, paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.FAILED },
    });
    if (flipped.count !== 1) return false;

    await db.transaction.updateMany({
      where: {
        orderId: order.id,
        type: TransactionType.PAYMENT,
        provider: TransactionProvider.COD,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
      },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: 'order_cancelled',
      },
    });
    return true;
  }

  /**
   * Get all transactions for a specific order.
   */
  async getOrderTransactions(orderId: string) {
    return this.prisma.transaction.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * List all transactions with filters (admin).
   */
  async listTransactions(query: TransactionQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.orderId) where.orderId = query.orderId;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              orderNumber: true,
              buyerId: true,
              sellerId: true,
              seller: {
                select: {
                  firstName: true,
                  lastName: true,
                  sellerProfile: { select: { businessName: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
