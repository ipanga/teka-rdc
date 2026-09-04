import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveDeliveryAddress } from '../orders/delivery-address.util';
import { AdminOrderQueryDto } from './dto/admin-order-query.dto';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import {
  CommissionNotConfiguredError,
  EarningsService,
} from '../payments/earnings.service';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentsService } from '../payments/payments.service';
import { OrderNotificationService } from '../notifications/order-notification.service';
import { PostHogService } from '../analytics/posthog.service';
import { canTransition } from '../orders/order-workflow.constants';

// Relations returned on every admin order-transition response (list/detail
// rows the admin-web table + detail page already read).
const ADMIN_TRANSITION_INCLUDE = {
  items: true,
  buyer: {
    select: { id: true, firstName: true, lastName: true, phone: true },
  },
  seller: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      sellerProfile: { select: { businessName: true } },
    },
  },
  statusLogs: { orderBy: { createdAt: 'desc' as const }, take: 5 },
} as const;

@Injectable()
export class AdminOrdersService {
  private readonly logger = new Logger(AdminOrdersService.name);

  constructor(
    private prisma: PrismaService,
    private earningsService: EarningsService,
    private paymentsService: PaymentsService,
    private notificationService: OrderNotificationService,
    private analytics: PostHogService,
  ) {}

  /**
   * Returns paginated list of all orders with filters for admin.
   */
  async findAllOrders(query: AdminOrderQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {
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

    if (query.sellerId) {
      where.sellerId = query.sellerId;
    }

    if (query.buyerId) {
      where.buyerId = query.buyerId;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
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
              sellerProfile: {
                select: { businessName: true },
              },
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
   * Returns full order detail with all relations for admin.
   */
  async findOrderById(orderId: string) {
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
        // Persisted earning (after delivery) for the commission/net breakdown.
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
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            sellerProfile: {
              select: {
                businessName: true,
                businessType: true,
                location: true,
              },
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
            changedBy: true,
            note: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    // Financial breakdown for the admin: seller revenue (subtotal), the Teka
    // commission (platform revenue), and the seller net. Uses the persisted
    // earning once delivered (final); otherwise projects from the current rate.
    const b = order.earning
      ? {
          grossCDF: order.earning.grossAmountCDF,
          commissionCDF: order.earning.commissionCDF,
          netCDF: order.earning.netAmountCDF,
          commissionRate: order.earning.commissionRate,
          isFinal: true,
        }
      : await this.projectBreakdown(order);

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
   * Admin escape hatch: force any status onto an order, bypassing
   * `canTransition`. Always writes an `OrderStatusLog` for audit.
   *
   * **This is a repair tool, not a delivery workflow.** It deliberately does
   * NOT run delivery side effects — no `SellerEarning`, no `unitsSold`
   * increment, no COD `paymentStatus` flip, no stock movement, no
   * notification. That is the point: it exists to correct a wrong status
   * without double-booking money or stock on an order that already went
   * through the real flow. Use `markDelivered()` for an actual delivery.
   *
   * The ONE thing it must still do is keep the row internally consistent:
   * `deliveredAt` is not an optional decoration on a delivered order, it is
   * the column every downstream reader uses as the delivery date — the return
   * window (`isWithinReturnWindow`), payout eligibility
   * (`EarningsService.eligibleEarningWhere`), `AdminStatsService`'s
   * delivered-today count, and the sales-analytics time axis. Leaving it NULL
   * produced an order that is DELIVERED to the UI but invisible to every
   * date-windowed query, and un-returnable by the buyer
   * (`isWithinReturnWindow(null)` is false).
   *
   * So forcing a status to DELIVERED stamps `deliveredAt` **only when it is
   * not already set**, which preserves the original, more accurate timestamp
   * across a DELIVERED -> X -> DELIVERED round trip and never resets a return
   * window that has already started.
   */
  async forceStatusChange(
    orderId: string,
    status: OrderStatus,
    adminId: string,
    note?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, deletedAt: null },
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    if (order.status === status) {
      throw new BadRequestException(
        `La commande est déjà en statut "${status}"`,
      );
    }

    // Keep the row self-consistent: a DELIVERED order must carry a delivery
    // date. Only ever FILLS a gap — never overwrites an existing timestamp.
    const data: { status: OrderStatus; deliveredAt?: Date } = { status };
    if (status === OrderStatus.DELIVERED && !order.deliveredAt) {
      data.deliveredAt = new Date();
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.orderStatusLog.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: status,
          changedBy: adminId,
          note: note || `Changement forcé par l'administrateur`,
        },
      });

      // Leaving DELIVERED (forced cancel / rewind) means the sale no longer
      // stands: reverse its earning auditably (D6). Kept as the ONLY financial
      // side effect of this repair tool — forcing INTO DELIVERED still creates
      // nothing (documented: use markDelivered for a real delivery).
      if (order.status === OrderStatus.DELIVERED) {
        await this.earningsService.reverseEarning(
          orderId,
          tx,
          'ORDER_STATUS_FORCED',
        );
      }

      return tx.order.update({
        where: { id: orderId },
        data,
        include: {
          items: true,
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
              sellerProfile: {
                select: { businessName: true },
              },
            },
          },
          statusLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      });
    });
  }

  /**
   * Admin cancels an order with a reason.
   */
  async adminCancelOrder(orderId: string, adminId: string, reason: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, deletedAt: null },
    });

    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cette commande est déjà annulée');
    }

    if (order.status === OrderStatus.DELIVERED) {
      throw new BadRequestException(
        "Impossible d'annuler une commande déjà livrée. Utilisez le retour à la place.",
      );
    }

    let paymentFailed = false;
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.orderStatusLog.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.CANCELLED,
          changedBy: adminId,
          note: `Annulée par l'administrateur : ${reason}`,
        },
      });

      // D7: unpaid COD → payment FAILED in the same transaction.
      paymentFailed = await this.paymentsService.failCodPaymentOnCancellation(
        order,
        tx,
      );

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
          cancelledBy: adminId,
        },
        include: {
          items: true,
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
              sellerProfile: {
                select: { businessName: true },
              },
            },
          },
          statusLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      });
    });

    if (paymentFailed) {
      this.analytics.capture(updated.buyerId, 'payment_failed', {
        orderId,
        method: PaymentMethod.COD,
        reason: 'order_cancelled',
        actor: 'admin',
      });
    }
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Teka-managed delivery transitions (admin / ops center owns these).
  // Seller hands off at READY_FOR_TEKA_PICKUP; everything below is Teka's.
  // ---------------------------------------------------------------------------

  /** READY_FOR_TEKA_PICKUP -> RECEIVED_AT_TEKA (Teka confirms warehouse intake). */
  async markReceivedAtTeka(orderId: string, adminId: string) {
    const updated = await this.applyTransition(
      orderId,
      adminId,
      OrderStatus.RECEIVED_AT_TEKA,
      'Reçue par Teka RDC',
    );
    this.analytics.capture(updated.buyerId, 'order_received_at_teka', {
      orderId,
      orderNumber: updated.orderNumber,
      sellerId: updated.sellerId,
      status: OrderStatus.RECEIVED_AT_TEKA,
    });
    this.notificationService
      .notifyOrderReceivedAtTeka(updated)
      .catch((err) =>
        this.logger.error('Échec de notification (reçue par Teka)', err),
      );
    return updated;
  }

  /** RECEIVED_AT_TEKA (or legacy SHIPPED) -> OUT_FOR_DELIVERY. */
  async markOutForDelivery(orderId: string, adminId: string) {
    const updated = await this.applyTransition(
      orderId,
      adminId,
      OrderStatus.OUT_FOR_DELIVERY,
      'En cours de livraison',
    );
    this.analytics.capture(updated.buyerId, 'order_out_for_delivery', {
      orderId,
      orderNumber: updated.orderNumber,
      sellerId: updated.sellerId,
      status: OrderStatus.OUT_FOR_DELIVERY,
    });
    this.notificationService
      .notifyOrderOutForDelivery(updated)
      .catch((err) =>
        this.logger.error('Échec de notification (en livraison)', err),
      );
    return updated;
  }

  /**
   * OUT_FOR_DELIVERY (or legacy SHIPPED) -> DELIVERED. The Teka agent has
   * delivered the parcel and collected the COD cash, so this also:
   *  - stamps `deliveredAt` (anchors the return window + payout eligibility),
   *  - marks the COD payment COMPLETED (cash collected),
   *  - bumps each product's unitsSold,
   *  - completes the COD transaction + creates the seller earning.
   */
  async markDelivered(orderId: string, adminId: string) {
    const order = await this.loadOrder(orderId);
    this.assertTransition(order.status, OrderStatus.DELIVERED);

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      await tx.orderStatusLog.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.DELIVERED,
          changedBy: adminId,
          note: 'Livrée — encaissement confirmé',
        },
      });

      const data: {
        status: OrderStatus;
        deliveredAt: Date;
        paymentStatus?: PaymentStatus;
      } = {
        status: OrderStatus.DELIVERED,
        deliveredAt: new Date(),
      };
      if (order.paymentMethod === PaymentMethod.COD) {
        data.paymentStatus = PaymentStatus.COMPLETED;
      }

      const result = await tx.order.update({
        where: { id: orderId },
        data,
        include: ADMIN_TRANSITION_INCLUDE,
      });

      for (const item of result.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { unitsSold: { increment: item.quantity } },
        });
      }

      // Financial side effects commit WITH the status flip (never after it):
      // the COD cash is collected → the transaction completes and the seller
      // earning is created with its commission snapshot. A failure here rolls
      // the delivery back — an order can never be DELIVERED without its earning.
      if (order.paymentMethod === PaymentMethod.COD) {
        await this.paymentsService.completeCodTransaction(orderId, tx);
      }
      if (
        result.paymentStatus === PaymentStatus.COMPLETED ||
        order.paymentMethod === PaymentMethod.COD
      ) {
        await this.earningsService.createEarning(orderId, tx);
      }

      return result;
    });

    // Fire-and-forget side effects (notifications + analytics only).
    this.notificationService
      .notifyOrderDelivered(updatedOrder)
      .catch((err) =>
        this.logger.error('Échec de notification de livraison', err),
      );

    this.analytics.capture(updatedOrder.buyerId, 'order_delivered', {
      orderId,
      orderNumber: updatedOrder.orderNumber,
      sellerId: updatedOrder.sellerId,
      status: OrderStatus.DELIVERED,
    });
    if (order.paymentMethod === PaymentMethod.COD) {
      this.analytics.capture(updatedOrder.buyerId, 'payment_completed', {
        orderId,
        method: PaymentMethod.COD,
        amount_cdf: Number(updatedOrder.totalCDF),
      });
    }

    return updatedOrder;
  }

  // --- private transition helpers -------------------------------------------

  /**
   * Pre-delivery "à recevoir" projection at today's rules, per item (D5). A
   * missing commission configuration is reported as a zero-commission, non-
   * final projection rather than a 500 — the final earning at delivery is the
   * only authoritative figure and it fails loudly instead.
   */
  private async projectBreakdown(order: {
    sellerId: string;
    subtotalCDF: bigint;
    items: {
      totalCDF: bigint;
      product?: { categoryId: string | null } | null;
    }[];
  }) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId: order.sellerId },
      select: { id: true },
    });
    if (!profile) {
      return {
        grossCDF: order.subtotalCDF,
        commissionCDF: BigInt(0),
        netCDF: order.subtotalCDF,
        commissionRate: new Decimal(0),
        isFinal: false,
      };
    }
    try {
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
      if (err instanceof CommissionNotConfiguredError) {
        this.logger.warn(err.message);
        return {
          grossCDF: order.subtotalCDF,
          commissionCDF: BigInt(0),
          netCDF: order.subtotalCDF,
          commissionRate: new Decimal(0),
          isFinal: false,
        };
      }
      throw err;
    }
  }

  private async loadOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, deletedAt: null },
    });
    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }
    return order;
  }

  /** Throws if `from -> to` is not allowed by the canonical state machine. */
  private assertTransition(from: OrderStatus, to: OrderStatus): void {
    if (!canTransition(from, to)) {
      throw new BadRequestException(
        `Transition de statut invalide : "${from}" → "${to}".`,
      );
    }
  }

  /** Validated simple transition + audit log, returns the order with relations. */
  private async applyTransition(
    orderId: string,
    adminId: string,
    to: OrderStatus,
    note: string,
  ) {
    const order = await this.loadOrder(orderId);
    this.assertTransition(order.status, to);

    return this.prisma.$transaction(async (tx) => {
      await tx.orderStatusLog.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: to,
          changedBy: adminId,
          note,
        },
      });
      return tx.order.update({
        where: { id: orderId },
        data: { status: to },
        include: ADMIN_TRANSITION_INCLUDE,
      });
    });
  }
}
