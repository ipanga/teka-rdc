import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveDeliveryAddress } from '../orders/delivery-address.util';
import { AdminOrderQueryDto } from './dto/admin-order-query.dto';
import {
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import {
  CommissionNotConfiguredError,
  EarningsService,
} from '../payments/earnings.service';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentsService } from '../payments/payments.service';
import { OrderNotificationService } from '../notifications/order-notification.service';
import { PostHogService } from '../analytics/posthog.service';
import { canTransition } from '../orders/order-workflow.constants';
import {
  ADMIN_CANCELLABLE_STATUSES,
  isPaymentBlockingCancellation,
  isStockReleasedStatus,
  lockOrderForUpdate,
  releaseOrderStockHold,
  Tx,
} from '../orders/order-inventory';

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
   *
   * Inventory/payment invariants are NOT bypassable (2026-10, I1):
   *  - forced CANCELLED is the admin cancellation (same eligibility, same
   *    once-only stock release, same COD failure) — it used to skip both,
   *    leaving the stock held and the COD payment pending forever;
   *  - forced RETURNED is only accepted from DELIVERED and releases the hold
   *    once, like an approved return (no REFUND record — that stays the return
   *    flow's job);
   *  - CANCELLED and RETURNED are final: their stock was released, so the
   *    order can't be revived into a state that looks like it still holds it.
   */
  async forceStatusChange(
    orderId: string,
    status: OrderStatus,
    adminId: string,
    note?: string,
  ) {
    // Fast path only — re-validated on the locked row inside the transaction.
    this.validateForcedChange(await this.loadOrder(orderId), status);

    const logNote = note || `Changement forcé par l'administrateur`;
    const { updated, paymentFailed } = await this.prisma.$transaction(
      async (tx) => {
        const order = await lockOrderForUpdate(tx, orderId);
        if (!order) {
          throw new NotFoundException('Commande non trouvée');
        }
        this.validateForcedChange(order, status);

        if (status === OrderStatus.CANCELLED) {
          return this.cancelLockedOrder(tx, order, adminId, logNote, logNote);
        }
        return {
          updated: await this.forceLockedOrder(
            tx,
            order,
            status,
            adminId,
            logNote,
          ),
          paymentFailed: false,
        };
      },
      { timeout: 15_000 },
    );

    if (paymentFailed) {
      this.capturePaymentFailed(updated.buyerId, orderId);
    }
    return updated;
  }

  /** Non-cancelling forced change, on an order already locked + validated. */
  private async forceLockedOrder(
    tx: Tx,
    order: Order,
    status: OrderStatus,
    adminId: string,
    note: string,
  ) {
    const orderId = order.id;

    // Keep the row self-consistent: a DELIVERED order must carry a delivery
    // date, and a RETURNED one a return date — `returnedAt` is documented in
    // the schema as "set when admin approves a return", and
    // `ReturnsService.approveReturn()` only ever writes the two together. A
    // forced RETURNED left the status without its timestamp, which is the same
    // internal inconsistency `deliveredAt` was fixed for.
    // Only ever FILLS a gap — never overwrites an existing timestamp.
    const data: {
      status: OrderStatus;
      deliveredAt?: Date;
      returnedAt?: Date;
    } = { status };
    if (status === OrderStatus.DELIVERED && !order.deliveredAt) {
      data.deliveredAt = new Date();
    }
    if (status === OrderStatus.RETURNED && !order.returnedAt) {
      data.returnedAt = new Date();
    }

    // A forced RETURNED (only ever from DELIVERED) puts the goods back like an
    // approved return: release the hold once — before this move's own log.
    if (status === OrderStatus.RETURNED) {
      await releaseOrderStockHold(tx, orderId);
    }

    await tx.orderStatusLog.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: status,
        changedBy: adminId,
        note,
      },
    });

    // Leaving DELIVERED (forced return / rewind) means the sale no longer
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
      include: ADMIN_TRANSITION_INCLUDE,
    });
  }

  /**
   * What `forceStatusChange` refuses. CANCELLED / RETURNED are final (their
   * stock hold is gone); a forced CANCELLED obeys the admin-cancel rules; a
   * forced RETURNED needs a delivered order.
   */
  private validateForcedChange(order: Order, status: OrderStatus): void {
    if (order.status === status) {
      throw new BadRequestException(
        `La commande est déjà en statut "${status}"`,
      );
    }
    if (isStockReleasedStatus(order.status)) {
      throw new BadRequestException(
        'Une commande annulée ou retournée ne peut plus changer de statut : son stock a déjà été libéré. Le client doit passer une nouvelle commande.',
      );
    }
    if (status === OrderStatus.CANCELLED) {
      this.validateAdminCancel(order);
    }
    if (
      status === OrderStatus.RETURNED &&
      order.status !== OrderStatus.DELIVERED
    ) {
      throw new BadRequestException(
        "Seule une commande livrée peut être marquée retournée. Pour une commande non livrée, utilisez l'annulation.",
      );
    }
  }

  /** Admin cancellation rules (dedicated cancel AND forced CANCELLED). */
  private validateAdminCancel(order: Order): void {
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cette commande est déjà annulée');
    }

    if (order.status === OrderStatus.DELIVERED) {
      throw new BadRequestException(
        "Impossible d'annuler une commande déjà livrée. Utilisez le retour à la place.",
      );
    }

    if (order.status === OrderStatus.RETURNED) {
      throw new BadRequestException(
        "Impossible d'annuler une commande déjà retournée.",
      );
    }

    if (isPaymentBlockingCancellation(order.paymentStatus)) {
      throw new BadRequestException(
        "Impossible d'annuler une commande déjà encaissée ou remboursée.",
      );
    }

    if (!ADMIN_CANCELLABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `Transition de statut invalide : "${order.status}" → "${OrderStatus.CANCELLED}".`,
      );
    }
  }

  /**
   * The admin cancellation itself, on an order already locked + validated:
   * once-only stock release, audit log, conditional COD failure, status.
   */
  private async cancelLockedOrder(
    tx: Tx,
    order: Order,
    adminId: string,
    reason: string,
    note: string,
  ) {
    // Restore stock held since checkout — before this transition's own log.
    await releaseOrderStockHold(tx, order.id);

    await tx.orderStatusLog.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: OrderStatus.CANCELLED,
        changedBy: adminId,
        note,
      },
    });

    // D7: unpaid COD → the order payment and its COD transaction fail in the
    // same transaction, decided on the locked row.
    const paymentFailed = await this.paymentsService.failUnpaidCodPayment(
      order.id,
      tx,
    );

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.CANCELLED,
        cancellationReason: reason,
        cancelledBy: adminId,
      },
      include: ADMIN_TRANSITION_INCLUDE,
    });
    return { updated, paymentFailed };
  }

  private capturePaymentFailed(buyerId: string, orderId: string): void {
    this.analytics.capture(buyerId, 'payment_failed', {
      orderId,
      method: PaymentMethod.COD,
      reason: 'order_cancelled',
      actor: 'admin',
    });
  }

  /**
   * Admin cancels an order with a reason. Allowed before delivery (incl. a
   * parcel refused at the door) and only while unpaid; re-validated on the
   * locked row so it cannot race a delivery or another cancellation.
   */
  async adminCancelOrder(orderId: string, adminId: string, reason: string) {
    // Fast path only — re-validated on the locked row inside the transaction.
    this.validateAdminCancel(await this.loadOrder(orderId));

    const { updated, paymentFailed } = await this.prisma.$transaction(
      async (tx) => {
        const order = await lockOrderForUpdate(tx, orderId);
        if (!order) {
          throw new NotFoundException('Commande non trouvée');
        }
        this.validateAdminCancel(order);
        return this.cancelLockedOrder(
          tx,
          order,
          adminId,
          reason,
          `Annulée par l'administrateur : ${reason}`,
        );
      },
      { timeout: 15_000 },
    );

    if (paymentFailed) {
      this.capturePaymentFailed(updated.buyerId, orderId);
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
    // Fast path only — re-validated on the locked row inside the transaction,
    // so a delivery can never overwrite a cancellation that just committed.
    const preRead = await this.loadOrder(orderId);
    this.assertTransition(preRead.status, OrderStatus.DELIVERED);

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const order = await this.lockAndAssert(
        tx,
        orderId,
        OrderStatus.DELIVERED,
      );

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

      // productId order — the lock order checkout and stock release use.
      const lines = [...result.items].sort((a, b) =>
        a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0,
      );
      for (const item of lines) {
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
    if (updatedOrder.paymentMethod === PaymentMethod.COD) {
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

  /**
   * Locks the order row and re-asserts `current -> to` on what is now the
   * committed state — the authoritative check (the caller's pre-read is only
   * a fast path). A transition that lost a race to a cancellation therefore
   * fails with the usual "Transition de statut invalide" instead of
   * resurrecting the cancelled order.
   */
  private async lockAndAssert(tx: Tx, orderId: string, to: OrderStatus) {
    const order = await lockOrderForUpdate(tx, orderId);
    if (!order) {
      throw new NotFoundException('Commande non trouvée');
    }
    this.assertTransition(order.status, to);
    return order;
  }

  /** Validated simple transition + audit log, returns the order with relations. */
  private async applyTransition(
    orderId: string,
    adminId: string,
    to: OrderStatus,
    note: string,
  ) {
    const preRead = await this.loadOrder(orderId);
    this.assertTransition(preRead.status, to);

    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockAndAssert(tx, orderId, to);
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
