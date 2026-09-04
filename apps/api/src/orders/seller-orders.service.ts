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
import {
  CommissionNotConfiguredError,
  EarningsService,
} from '../payments/earnings.service';
import { Decimal } from '@prisma/client/runtime/library';
import { PostHogService } from '../analytics/posthog.service';
import { PaymentsService } from '../payments/payments.service';
import { SellerOrderQueryDto } from './dto/seller-order-query.dto';
import { OrderStatus, PaymentMethod } from '@prisma/client';

/**
 * Maps an order's new status to its PostHog event name. Attributed to the
 * buyer (distinctId = order.buyerId) so the customer's order funnel reads
 * created → confirmed → shipped → delivered, with sellerId as a property.
 */
const ORDER_STATUS_EVENT: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.CONFIRMED]: 'order_confirmed',
  [OrderStatus.PROCESSING]: 'order_processing',
  [OrderStatus.READY_FOR_TEKA_PICKUP]: 'order_ready_for_pickup',
  [OrderStatus.RECEIVED_AT_TEKA]: 'order_received_at_teka',
  [OrderStatus.SHIPPED]: 'order_shipped',
  [OrderStatus.OUT_FOR_DELIVERY]: 'order_out_for_delivery',
  [OrderStatus.DELIVERED]: 'order_delivered',
  [OrderStatus.CANCELLED]: 'order_cancelled',
};

@Injectable()
export class SellerOrdersService {
  private readonly logger = new Logger(SellerOrdersService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: OrderNotificationService,
    private earningsService: EarningsService,
    private analytics: PostHogService,
    private paymentsService: PaymentsService,
  ) {}

  /**
   * Fire-and-forget order-status analytics. Reads buyerId/orderNumber/
   * sellerId off the updated order; no-op for statuses without an event.
   */
  private trackOrderStatus(
    order: {
      id: string;
      buyerId: string;
      orderNumber: string;
      sellerId: string;
    },
    toStatus: OrderStatus,
  ): void {
    const event = ORDER_STATUS_EVENT[toStatus];
    if (!event) return;
    this.analytics.capture(order.buyerId, event, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      sellerId: order.sellerId,
      status: toStatus,
    });
  }

  // Canonical state-machine lives in order-workflow.constants.ts
  // (ORDER_STATUS_TRANSITIONS). Each seller action below validates its own
  // explicit precondition via validateTransition().

  /**
   * Returns paginated list of seller's orders.
   */
  async findSellerOrders(sellerId: string, query: SellerOrderQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {
      sellerId,
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
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
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
   * Order counts grouped into the seller-dashboard summary buckets.
   * Drives the "Nouvelles / À préparer / Prêtes pour collecte / …" cards.
   */
  async getOrderStats(sellerId: string) {
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      where: { sellerId, deletedAt: null },
      _count: { _all: true },
    });

    const counts: Partial<Record<OrderStatus, number>> = {};
    for (const g of grouped) {
      counts[g.status] = g._count._all;
    }
    const sum = (...statuses: OrderStatus[]) =>
      statuses.reduce((n, s) => n + (counts[s] ?? 0), 0);

    return {
      byStatus: counts,
      summary: {
        nouvelles: sum(OrderStatus.PENDING),
        aPreparer: sum(OrderStatus.CONFIRMED, OrderStatus.PROCESSING),
        pretesPourCollecte: sum(OrderStatus.READY_FOR_TEKA_PICKUP),
        enLivraison: sum(
          OrderStatus.RECEIVED_AT_TEKA,
          OrderStatus.OUT_FOR_DELIVERY,
          OrderStatus.SHIPPED,
        ),
        livrees: sum(OrderStatus.DELIVERED),
        annulees: sum(OrderStatus.CANCELLED),
        retours: sum(OrderStatus.RETURNED),
      },
    };
  }

  /**
   * Returns full order detail for a seller.
   * Validates the order belongs to the requesting seller.
   */
  async findSellerOrderById(sellerId: string, orderId: string) {
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
            product: { select: { categoryId: true } },
          },
        },
        // The persisted earning (only after delivery) — used for the seller's
        // revenue/commission/net breakdown; before delivery we project it.
        earning: {
          select: {
            grossAmountCDF: true,
            commissionCDF: true,
            netAmountCDF: true,
            commissionRate: true,
          },
        },
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
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

    if (order.sellerId !== sellerId) {
      throw new ForbiddenException("Vous n'avez pas accès à cette commande");
    }

    // Seller financial breakdown: revenue (subtotal), Teka commission, and the
    // net "à recevoir". Use the persisted earning once it exists (delivered →
    // final); otherwise project it from the current commission rate.
    const b = order.earning
      ? {
          grossCDF: order.earning.grossAmountCDF,
          commissionCDF: order.earning.commissionCDF,
          netCDF: order.earning.netAmountCDF,
          commissionRate: order.earning.commissionRate,
          isFinal: true,
        }
      : await (async () => {
          // Projection at today's rules, per item (D5). Only the persisted
          // earning is authoritative; a missing commission configuration
          // degrades to a zero-commission projection instead of failing.
          const profile = await this.prisma.sellerProfile.findUnique({
            where: { userId: sellerId },
            select: { id: true },
          });
          try {
            if (!profile) throw new CommissionNotConfiguredError();
            const p = await this.earningsService.computeBreakdown(
              profile.id,
              order.items.map((i) => ({
                totalCDF: i.totalCDF,
                categoryId: i.product?.categoryId ?? null,
              })),
            );
            return {
              grossCDF: p.grossAmountCDF,
              commissionCDF: p.commissionCDF,
              netCDF: p.netAmountCDF,
              commissionRate: p.commissionRate,
              isFinal: false,
            };
          } catch (err) {
            if (!(err instanceof CommissionNotConfiguredError)) throw err;
            return {
              grossCDF: order.subtotalCDF,
              commissionCDF: BigInt(0),
              netCDF: order.subtotalCDF,
              commissionRate: new Decimal(0),
              isFinal: false,
            };
          }
        })();

    return {
      ...resolveDeliveryAddress(order),
      financials: {
        grossCDF: b.grossCDF.toString(),
        commissionCDF: b.commissionCDF.toString(),
        netCDF: b.netCDF.toString(),
        commissionRate: b.commissionRate.toString(),
        isFinal: b.isFinal,
      },
    };
  }

  /**
   * Confirms a pending order: PENDING -> CONFIRMED.
   */
  async confirmOrder(sellerId: string, orderId: string) {
    const order = await this.findAndValidateSellerOrder(sellerId, orderId);
    this.validateTransition(
      order,
      [OrderStatus.PENDING],
      OrderStatus.CONFIRMED,
    );

    const updatedOrder = await this.transitionOrder(
      orderId,
      order.status,
      OrderStatus.CONFIRMED,
      sellerId,
    );

    // Fire-and-forget: notify buyer of confirmation
    this.notificationService
      .notifyOrderConfirmed(updatedOrder)
      .catch((err) =>
        this.logger.error('Échec de notification de confirmation', err),
      );

    return updatedOrder;
  }

  /**
   * Rejects a pending order: PENDING -> CANCELLED with reason.
   */
  async rejectOrder(sellerId: string, orderId: string, reason: string) {
    const order = await this.findAndValidateSellerOrder(sellerId, orderId);
    this.validateTransition(
      order,
      [OrderStatus.PENDING],
      OrderStatus.CANCELLED,
    );

    const paymentFailed = this.paymentsService.codPaymentWillFail(order);
    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      await this.createStatusLog(
        tx,
        orderId,
        order.status,
        OrderStatus.CANCELLED,
        sellerId,
        `Rejetée par le vendeur : ${reason}`,
      );

      // D7: unpaid COD → the COD transaction fails in the same transaction;
      // the order's paymentStatus flips inside the update below.
      if (paymentFailed) {
        await this.paymentsService.failCodTransactionOnCancellation(orderId, tx);
      }

      // Restore stock held since checkout.
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

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: reason,
          cancelledBy: sellerId,
          ...this.paymentsService.codPaymentFailureData(order),
        },
        include: {
          items: true,
          statusLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      });
    }, { timeout: 15_000 });

    // Fire-and-forget: notify buyer and seller of rejection/cancellation
    this.notificationService
      .notifyOrderCancelled(updatedOrder, `Rejetée par le vendeur : ${reason}`)
      .catch((err) => this.logger.error('Échec de notification de rejet', err));

    this.trackOrderStatus(updatedOrder, OrderStatus.CANCELLED);
    if (paymentFailed) {
      this.analytics.capture(updatedOrder.buyerId, 'payment_failed', {
        orderId,
        method: PaymentMethod.COD,
        reason: 'order_cancelled',
        actor: 'seller',
      });
    }

    return updatedOrder;
  }

  /**
   * Moves order to processing: CONFIRMED -> PROCESSING.
   */
  async processOrder(sellerId: string, orderId: string) {
    const order = await this.findAndValidateSellerOrder(sellerId, orderId);
    this.validateTransition(
      order,
      [OrderStatus.CONFIRMED],
      OrderStatus.PROCESSING,
    );

    return this.transitionOrder(
      orderId,
      order.status,
      OrderStatus.PROCESSING,
      sellerId,
    );
  }

  /**
   * Seller hands the parcel off to Teka: PROCESSING -> READY_FOR_TEKA_PICKUP.
   * This is the seller's last step — Teka/admin drives everything after.
   */
  async markReadyForPickup(sellerId: string, orderId: string) {
    const order = await this.findAndValidateSellerOrder(sellerId, orderId);
    this.validateTransition(
      order,
      [OrderStatus.PROCESSING],
      OrderStatus.READY_FOR_TEKA_PICKUP,
    );

    const updatedOrder = await this.transitionOrder(
      orderId,
      order.status,
      OrderStatus.READY_FOR_TEKA_PICKUP,
      sellerId,
    );

    // Fire-and-forget: notify buyer the parcel is ready for Teka pickup.
    this.notificationService
      .notifyOrderReadyForPickup(updatedOrder)
      .catch((err) =>
        this.logger.error('Échec de notification (prête pour collecte)', err),
      );

    return updatedOrder;
  }

  // Delivery to the buyer (received-at-Teka → out-for-delivery → delivered +
  // cash collection) moved to AdminOrdersService in the managed-workflow
  // rollout — Teka, not the seller, controls the logistics chain. The seller's
  // last action is markReadyForPickup above.

  /**
   * Validates that the requested status transition is allowed.
   * Throws BadRequestException if the current status is not in the expected statuses.
   */
  private validateTransition(
    order: { status: OrderStatus },
    expectedStatuses: OrderStatus[],
    targetStatus: OrderStatus,
  ): void {
    if (!expectedStatuses.includes(order.status)) {
      const expectedLabels = expectedStatuses.join(', ');
      throw new BadRequestException(
        `Transition de statut invalide. La commande est en statut "${order.status}" mais doit être en "${expectedLabels}" pour passer à "${targetStatus}"`,
      );
    }
  }

  /**
   * Creates a status log entry within a transaction.
   */
  private async createStatusLog(
    tx: any,
    orderId: string,
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
    changedBy: string,
    note?: string,
  ) {
    return tx.orderStatusLog.create({
      data: {
        orderId,
        fromStatus,
        toStatus,
        changedBy,
        ...(note && { note }),
      },
    });
  }

  /**
   * Finds an order and validates it belongs to the seller.
   */
  private async findAndValidateSellerOrder(sellerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, deletedAt: null },
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    if (order.sellerId !== sellerId) {
      throw new ForbiddenException("Vous n'avez pas accès à cette commande");
    }

    return order;
  }

  /**
   * Performs a simple status transition with log entry.
   */
  private async transitionOrder(
    orderId: string,
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
    changedBy: string,
    note?: string,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.createStatusLog(
        tx,
        orderId,
        fromStatus,
        toStatus,
        changedBy,
        note,
      );

      return tx.order.update({
        where: { id: orderId },
        data: { status: toStatus },
        include: {
          items: true,
          statusLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      });
    });

    this.trackOrderStatus(updated, toStatus);
    return updated;
  }
}
