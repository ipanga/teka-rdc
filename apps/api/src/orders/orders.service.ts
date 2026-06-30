import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderNotificationService } from '../notifications/order-notification.service';
import { PostHogService } from '../analytics/posthog.service';
import { OrderQueryDto } from './dto/order-query.dto';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { BUYER_CANCELLABLE_STATUSES } from './order-workflow.constants';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: OrderNotificationService,
    private analytics: PostHogService,
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
      data,
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

    return order;
  }

  /**
   * Cancels a buyer's order. Only PENDING orders can be cancelled by the buyer.
   */
  async cancelOrder(userId: string, orderId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, deletedAt: null },
    });

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

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // Create status log
      await tx.orderStatusLog.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.CANCELLED,
          changedBy: userId,
          note: reason || "Annulée par l'acheteur",
        },
      });

      // Restore stock held since checkout (decremented at order creation).
      const heldItems = await tx.orderItem.findMany({
        where: { orderId },
        select: { productId: true, quantity: true },
      });
      for (const it of heldItems) {
        await tx.product.update({
          where: { id: it.productId },
          data: { quantity: { increment: it.quantity } },
        });
      }

      // Update order
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: reason || "Annulée par l'acheteur",
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
    });

    // Fire-and-forget: notify buyer and seller of cancellation
    this.notificationService
      .notifyOrderCancelled(updatedOrder, reason || "Annulée par l'acheteur")
      .catch((err) =>
        this.logger.error("Échec de notification d'annulation", err),
      );

    // Server-owned analytics: buyer-initiated cancellation. For COD this
    // also means no money will ever be taken (payment_failed), mirroring
    // the seed precedent (cancelled COD => paymentStatus FAILED).
    this.analytics.capture(userId, 'order_cancelled', {
      orderId,
      sellerId: order.sellerId,
      actor: 'buyer',
    });
    if (order.paymentMethod === PaymentMethod.COD) {
      this.analytics.capture(userId, 'payment_failed', {
        orderId,
        method: PaymentMethod.COD,
        reason: 'order_cancelled',
      });
    }

    return updatedOrder;
  }
}
