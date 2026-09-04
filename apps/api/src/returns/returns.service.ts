import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EarningsService } from '../payments/earnings.service';
import { OrderNotificationService } from '../notifications/order-notification.service';
import { PostHogService } from '../analytics/posthog.service';
import {
  OrderStatus,
  ReturnStatus,
  TransactionType,
  TransactionProvider,
  PaymentStatus,
} from '@prisma/client';
import {
  isWithinReturnWindow,
  RETURN_WINDOW_DAYS,
} from '../orders/order-workflow.constants';

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private prisma: PrismaService,
    private earningsService: EarningsService,
    private notificationService: OrderNotificationService,
    private analytics: PostHogService,
  ) {}

  /**
   * Buyer requests a return. Allowed only on a DELIVERED order the buyer owns,
   * within RETURN_WINDOW_DAYS of delivery, and only one active request at a time.
   */
  async createReturnRequest(buyerId: string, orderId: string, reason: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, deletedAt: null },
      select: { id: true, buyerId: true, status: true, deliveredAt: true },
    });
    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }
    if (order.buyerId !== buyerId) {
      throw new ForbiddenException("Vous n'avez pas accès à cette commande");
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'Seules les commandes livrées peuvent être retournées',
      );
    }
    if (!isWithinReturnWindow(order.deliveredAt)) {
      throw new BadRequestException(
        `La fenêtre de retour de ${RETURN_WINDOW_DAYS} jours est expirée`,
      );
    }

    const active = await this.prisma.returnRequest.findFirst({
      where: { orderId, status: ReturnStatus.REQUESTED, deletedAt: null },
      select: { id: true },
    });
    if (active) {
      throw new BadRequestException(
        'Une demande de retour est déjà en cours pour cette commande',
      );
    }

    const created = await this.prisma.returnRequest.create({
      data: { orderId, buyerId, reason: reason.trim() },
    });

    // Notify the seller + track the event (fire-and-forget).
    this.notificationService
      .notifyReturnRequested({ id: orderId })
      .catch((err) =>
        this.logger.error('Échec notification (retour demandé)', err),
      );
    this.analytics.capture(buyerId, 'return_requested', { orderId });

    return created;
  }

  /** Admin: paginated list of return requests, optional status filter. */
  async listReturns(query: { page?: number; limit?: number; status?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: { deletedAt: null; status?: ReturnStatus } = {
      deletedAt: null,
    };
    if (query.status) {
      if (!Object.values(ReturnStatus).includes(query.status as ReturnStatus)) {
        throw new BadRequestException('Statut de retour invalide');
      }
      where.status = query.status as ReturnStatus;
    }

    const [data, total] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              totalCDF: true,
              deliveredAt: true,
              buyer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                },
              },
              seller: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  sellerProfile: { select: { businessName: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.returnRequest.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin approves a return: order → RETURNED, stock restored, earning reversed
   * (or flagged if already paid out), and a REFUND transaction recorded.
   */
  async approveReturn(returnId: string, adminId: string, note?: string) {
    const ret = await this.loadPendingReturn(returnId);
    const order = ret.order;
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'Seule une commande livrée peut être retournée',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status: ReturnStatus.APPROVED,
          reviewedById: adminId,
          reviewedAt: new Date(),
          reviewNote: note,
        },
      });

      await tx.orderStatusLog.create({
        data: {
          orderId: order.id,
          fromStatus: OrderStatus.DELIVERED,
          toStatus: OrderStatus.RETURNED,
          changedBy: adminId,
          note: note ? `Retour approuvé : ${note}` : 'Retour approuvé',
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.RETURNED, returnedAt: new Date() },
      });

      // Restore stock for every line item.
      const items = await tx.orderItem.findMany({
        where: { orderId: order.id },
        select: { productId: true, quantity: true },
      });
      for (const it of items) {
        await tx.product.update({
          where: { id: it.productId },
          data: { quantity: { increment: it.quantity } },
        });
      }

      // Reverse the seller earning auditably (row kept, stamped reversedAt);
      // flags a manual clawback when it is already reserved in a payout.
      const reversal = await this.earningsService.reverseEarning(
        order.id,
        tx,
        'RETURN_APPROVED',
      );

      // Record the buyer refund (COD cash returned by Teka).
      await tx.transaction.create({
        data: {
          orderId: order.id,
          type: TransactionType.REFUND,
          provider: TransactionProvider.MANUAL,
          amountCDF: order.totalCDF,
          currency: 'CDF',
          status: PaymentStatus.COMPLETED,
          metadata: { reason: 'return_approved', returnId },
        },
      });

      return reversal;
    });

    this.logger.log(
      `Return ${returnId} approved for order ${order.orderNumber} (earning reversed=${result.reversed}, inPayout=${result.inPayout})`,
    );

    this.notificationService
      .notifyReturnApproved({ id: order.id })
      .catch((err) =>
        this.logger.error('Échec notification (retour approuvé)', err),
      );

    return { id: returnId, status: ReturnStatus.APPROVED, ...result };
  }

  /** Admin rejects a return: the order stays DELIVERED, payout proceeds normally. */
  async rejectReturn(returnId: string, adminId: string, note?: string) {
    const ret = await this.loadPendingReturn(returnId);
    const updated = await this.prisma.returnRequest.update({
      where: { id: returnId },
      data: {
        status: ReturnStatus.REJECTED,
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNote: note,
      },
    });

    this.notificationService
      .notifyReturnRejected({ id: ret.order.id })
      .catch((err) =>
        this.logger.error('Échec notification (retour refusé)', err),
      );

    return updated;
  }

  private async loadPendingReturn(returnId: string) {
    const ret = await this.prisma.returnRequest.findUnique({
      where: { id: returnId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalCDF: true,
          },
        },
      },
    });
    if (!ret || ret.deletedAt) {
      throw new NotFoundException('Demande de retour non trouvée');
    }
    if (ret.status !== ReturnStatus.REQUESTED) {
      throw new BadRequestException(
        'Cette demande de retour a déjà été traitée',
      );
    }
    return ret;
  }
}
