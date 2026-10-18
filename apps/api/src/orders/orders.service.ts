import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveDeliveryAddress } from './delivery-address.util';
import { OrderNotificationService } from '../notifications/order-notification.service';
import { PostHogService } from '../analytics/posthog.service';
import { PaymentsService } from '../payments/payments.service';
import { OrderQueryDto } from './dto/order-query.dto';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { BUYER_CANCELLABLE_STATUSES } from './order-workflow.constants';
import {
  isPaymentBlockingCancellation,
  lockOrderForUpdate,
  releaseOrderStockHold,
} from './order-inventory';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: OrderNotificationService,
    private analytics: PostHogService,
    private paymentsService: PaymentsService,
  ) {}

  /**
   * Returns paginated list of buyer's orders with preview data.
   */
  async findBuyerOrders(userId: string, query: OrderQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {
      buyerId: userId,
      deletedAt: null,
    };

    if (query.status) {
      if (!Object.values(OrderStatus).includes(query.status as OrderStatus)) {
        throw new BadRequestException(
          `Statut invalide. Les valeurs valides sont : ${Object.values(OrderStatus).join(', ')}`,
        );
      }
      where.status = query.status as OrderStatus;
    }

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            take: 1,
            select: {
              id: true,
              productTitle: true,
              productImage: true,
              quantity: true,
              unitPriceCDF: true,
              unitPriceUSD: true,
              totalCDF: true,
              totalUSD: true,
            },
          },
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              sellerProfile: {
                select: { businessName: true },
              },
            },
          },
          statusLogs: {
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: {
              id: true,
              fromStatus: true,
              toStatus: true,
              createdAt: true,
            },
          },
          _count: {
            select: { items: true },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: data.map(resolveDeliveryAddress),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Returns full order detail for a buyer.
   * Validates the order belongs to the requesting user.
   */
  async findBuyerOrderById(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, deletedAt: null },
      include: {
        items: {
          select: {
            id: true,
            productId: true,
            productTitle: true,
            productImage: true,
            quantity: true,
            unitPriceCDF: true,
            unitPriceUSD: true,
            totalCDF: true,
            totalUSD: true,
            // Live product link target — lets the buyer order detail deep-link to
            // the city-first PDP (productHref) and detect an unavailable product
            // without breaking the order history (snapshots above stay authoritative).
            product: {
              select: {
                id: true,
                slug: true,
                shortCode: true,
                status: true,
                city: { select: { slug: true } },
              },
            },
          },
        },
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            sellerProfile: {
              select: { businessName: true, location: true },
            },
          },
        },
        deliveryAddress: {
          select: {
            id: true,
            label: true,
            province: true,
            town: true,
            neighborhood: true,
            avenue: true,
            reference: true,
            recipientName: true,
            recipientPhone: true,
          },
        },
        statusLogs: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            note: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    if (order.buyerId !== userId) {
      throw new ForbiddenException("Vous n'avez pas accès à cette commande");
    }

    return resolveDeliveryAddress(order);
  }

  /**
   * Eligibility of a buyer cancellation, shared by the fast pre-check and the
   * authoritative re-check on the locked row (so a lost race reports the same
   * precise French error a sequential retry would).
   */
  private assertBuyerCanCancel(
    order: {
      buyerId: string;
      status: OrderStatus;
      paymentStatus: PaymentStatus;
    } | null,
    userId: string,
  ): asserts order {
    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    if (order.buyerId !== userId) {
      throw new ForbiddenException("Vous n'avez pas accès à cette commande");
    }

    // Buyer may cancel only before the parcel leaves for Teka custody
    // (PENDING / CONFIRMED / PROCESSING). Once READY_FOR_TEKA_PICKUP or later
    // the goods are in the logistics chain — only admin can cancel.
    if (!BUYER_CANCELLABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        "Cette commande ne peut plus être annulée. Contactez le support si nécessaire.",
      );
    }

    if (isPaymentBlockingCancellation(order.paymentStatus)) {
      throw new BadRequestException(
        'Cette commande a déjà été encaissée et ne peut pas être annulée. Contactez le support.',
      );
    }
  }

  /**
   * Cancels a buyer's order while it is PENDING / CONFIRMED / PROCESSING and
   * unpaid. The decision is re-made on the locked row, so concurrent
   * cancellations (buyer retry, seller reject, admin) and fulfillment writes
   * cannot both win; the stock hold is released at most once
   * (`releaseOrderStockHold`).
   */
  async cancelOrder(userId: string, orderId: string, reason?: string) {
    // Fast path only — the authoritative check runs on the locked row below.
    const preRead = await this.prisma.order.findUnique({
      where: { id: orderId, deletedAt: null },
    });
    this.assertBuyerCanCancel(preRead, userId);

    const note = reason || "Annulée par l'acheteur";
    const { updatedOrder, paymentFailed } = await this.prisma.$transaction(async (tx) => {
      const order = await lockOrderForUpdate(tx, orderId);
      this.assertBuyerCanCancel(order, userId);

      // Restore stock held since checkout — before this transition's own log.
      await releaseOrderStockHold(tx, orderId);

      await tx.orderStatusLog.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.CANCELLED,
          changedBy: userId,
          note,
        },
      });

      // D7: an unpaid COD order that is cancelled will never be paid — the
      // order payment and its COD transaction fail in the same transaction.
      const paymentFailed = await this.paymentsService.failUnpaidCodPayment(
        orderId,
        tx,
      );

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: note,
          cancelledBy: userId,
        },
        include: {
          items: {
            select: {
              id: true,
              productTitle: true,
              productImage: true,
              quantity: true,
              unitPriceCDF: true,
              totalCDF: true,
            },
          },
          statusLogs: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });
      return { updatedOrder, paymentFailed };
    }, { timeout: 15_000 });

    // Fire-and-forget: notify buyer and seller of cancellation
    this.notificationService
      .notifyOrderCancelled(updatedOrder, note)
      .catch((err) =>
        this.logger.error("Échec de notification d'annulation", err),
      );

    // Server-owned analytics: buyer-initiated cancellation. `payment_failed`
    // fires exactly when the payment was flipped PENDING → FAILED (D7).
    this.analytics.capture(userId, 'order_cancelled', {
      orderId,
      sellerId: updatedOrder.sellerId,
      actor: 'buyer',
    });
    if (paymentFailed) {
      this.analytics.capture(userId, 'payment_failed', {
        orderId,
        method: PaymentMethod.COD,
        reason: 'order_cancelled',
        actor: 'buyer',
      });
    }

    return updatedOrder;
  }
}
