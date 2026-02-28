import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { PaymentProvider } from './interfaces/payment-provider.interface';
import type { WebhookPayload } from './interfaces/payment-provider.interface';
import {
  TransactionType,
  TransactionProvider,
  PaymentStatus,
  OrderStatus,
} from '@prisma/client';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { EarningsService } from './earnings.service';
import { randomUUID } from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly callbackUrl: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private earningsService: EarningsService,
    @Inject('PAYMENT_PROVIDER') private paymentProvider: PaymentProvider,
  ) {
    this.callbackUrl = this.configService.get<string>(
      'FLEXPAY_CALLBACK_URL',
      'http://localhost:5050/api/v1/payments/webhook/flexpay',
    );
  }

  /**
   * Initiate a Mobile Money payment for an order.
   * Creates a Transaction record and calls the payment provider.
   */
  async initiateOrderPayment(
    orderId: string,
    input: { mobileMoneyProvider: string; payerPhone: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        totalCDF: true,
        totalUSD: true,
        paymentMethod: true,
        paymentStatus: true,
        buyerId: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    // Check if there's already a completed or pending transaction
    const existingTx = await this.prisma.transaction.findFirst({
      where: {
        orderId,
        type: TransactionType.PAYMENT,
        status: { in: [PaymentStatus.COMPLETED, PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
      },
    });

    if (existingTx) {
      if (existingTx.status === PaymentStatus.COMPLETED) {
        return {
          transactionId: existingTx.id,
          externalReference: existingTx.externalReference,
          status: 'COMPLETED',
        };
      }
      // Return existing pending transaction
      return {
        transactionId: existingTx.id,
        externalReference: existingTx.externalReference,
        status: existingTx.status,
      };
    }

    const idempotencyKey = `PAY-${orderId}-${randomUUID().slice(0, 8)}`;

    // Call payment provider
    const result = await this.paymentProvider.initiatePayment({
      orderNumber: order.orderNumber,
      amountCDF: order.totalCDF,
      payerPhone: input.payerPhone,
      provider: input.mobileMoneyProvider as 'M_PESA' | 'AIRTEL_MONEY' | 'ORANGE_MONEY',
      description: `Paiement commande ${order.orderNumber}`,
      idempotencyKey,
    });

    // Create transaction record
    const transaction = await this.prisma.transaction.create({
      data: {
        orderId,
        type: TransactionType.PAYMENT,
        provider: TransactionProvider.FLEXPAY,
        amountCDF: order.totalCDF,
        amountUSD: order.totalUSD,
        currency: 'CDF',
        status: result.status === 'PENDING' ? PaymentStatus.PENDING : PaymentStatus.FAILED,
        externalReference: result.externalReference,
        idempotencyKey,
        metadata: result.rawResponse as object ?? undefined,
      },
    });

    // Update order paymentStatus
    if (result.status === 'FAILED') {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: PaymentStatus.FAILED },
      });
    } else {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: PaymentStatus.PROCESSING },
      });
    }

    this.logger.log(
      `Payment initiated for order ${order.orderNumber}: ref=${result.externalReference}, status=${result.status}`,
    );

    return {
      transactionId: transaction.id,
      externalReference: result.externalReference,
      status: result.status,
    };
  }

  /**
   * Create a COD transaction record for an order.
   */
  async createCodTransaction(orderId: string, amountCDF: bigint, amountUSD: bigint | null) {
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
   * Handle payment webhook callback (idempotent).
   */
  async handlePaymentCallback(payload: WebhookPayload) {
    const { externalReference, status } = payload;

    // Find the transaction by external reference
    const transaction = await this.prisma.transaction.findUnique({
      where: { externalReference },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            sellerId: true,
          },
        },
      },
    });

    if (!transaction) {
      this.logger.warn(`Webhook: no transaction found for ref=${externalReference}`);
      return { processed: false, reason: 'Transaction not found' };
    }

    // Idempotency: if already in terminal state, skip
    if (
      transaction.status === PaymentStatus.COMPLETED ||
      transaction.status === PaymentStatus.REFUNDED
    ) {
      this.logger.log(`Webhook: transaction ${externalReference} already ${transaction.status}, skipping`);
      return { processed: false, reason: 'Already processed' };
    }

    const newPaymentStatus =
      status === 'COMPLETED' ? PaymentStatus.COMPLETED : PaymentStatus.FAILED;

    await this.prisma.$transaction(async (tx) => {
      // Update transaction
      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: newPaymentStatus,
          metadata: payload.rawBody as object ?? undefined,
        },
      });

      // Update order payment status
      await tx.order.update({
        where: { id: transaction.orderId },
        data: { paymentStatus: newPaymentStatus },
      });
    });

    // If payment completed and order is already delivered, create earning
    if (
      newPaymentStatus === PaymentStatus.COMPLETED &&
      transaction.order.status === OrderStatus.DELIVERED
    ) {
      this.earningsService
        .createEarning(transaction.orderId)
        .catch((err) =>
          this.logger.error(`Failed to create earning for order ${transaction.orderId}`, err),
        );
    }

    this.logger.log(
      `Webhook processed: ref=${externalReference}, status=${newPaymentStatus}`,
    );

    return { processed: true, status: newPaymentStatus };
  }

  /**
   * Complete a COD transaction (called when order is delivered).
   */
  async completeCodTransaction(orderId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        orderId,
        type: TransactionType.PAYMENT,
        provider: TransactionProvider.COD,
      },
    });

    if (transaction && transaction.status !== PaymentStatus.COMPLETED) {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: PaymentStatus.COMPLETED },
      });
    }
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
