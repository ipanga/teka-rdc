import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { deliveryAddressSnapshot } from '../orders/delivery-address.util';
import { CartService } from '../cart/cart.service';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { OrderNotificationService } from '../notifications/order-notification.service';
import { PaymentsService } from '../payments/payments.service';
import { PostHogService } from '../analytics/posthog.service';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderStatus, PaymentStatus, ProductStatus } from '@prisma/client';
import { randomBytes } from 'crypto';

/** Order number prefix */
const ORDER_PREFIX = 'TK';

/** Prisma transaction-callback client (same shape used by generateOrderNumber). */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private prisma: PrismaService,
    private cartService: CartService,
    private deliveryZonesService: DeliveryZonesService,
    private notificationService: OrderNotificationService,
    private paymentsService: PaymentsService,
    private analytics: PostHogService,
  ) {}

  /**
   * Main checkout flow:
   * 1. Check idempotency key (return existing orders if found)
   * 2. Get cart + validate products
   * 3. Get delivery address
   * 4. Group items by seller
   * 5. Per seller: create Order + OrderItems, decrement stock
   * 6. Clear cart
   * 7. Return created orders
   */
  async checkout(userId: string, dto: CheckoutDto) {
    // 1. Idempotency check — return existing orders if key was already used
    const existingOrders = await this.prisma.order.findMany({
      where: { idempotencyKey: dto.idempotencyKey, buyerId: userId },
      include: {
        items: true,
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            sellerProfile: { select: { businessName: true } },
          },
        },
        deliveryAddress: true,
      },
    });

    if (existingOrders.length > 0) {
      return {
        orders: existingOrders,
        checkoutGroupId: existingOrders[0].checkoutGroupId,
        isIdempotent: true,
      };
    }

    // 2. Get cart summary (grouped by seller)
    const cartSummary = await this.cartService.getCartSummary(userId);

    if (cartSummary.items.length === 0) {
      throw new BadRequestException('Votre panier est vide');
    }

    // 3. Validate delivery address belongs to user
    const address = await this.prisma.address.findFirst({
      where: {
        id: dto.deliveryAddressId,
        userId,
        deletedAt: null,
      },
      include: { city: { select: { name: true } } },
    });

    if (!address) {
      throw new NotFoundException('Adresse de livraison non trouvée');
    }

    // Resolve the delivery destination to a CITY name (zones are keyed by city).
    // Fall back to the free-form town so legacy addresses without a cityId still
    // resolve. A commune-level town ("Ruashi") thus maps to its city.
    const buyerTown = address.city?.name ?? address.town;

    // 4. Generate a checkout group ID
    const checkoutGroupId = crypto.randomUUID();

    // 5. Execute everything in a Prisma transaction (30s timeout for slow cloud DB)
    const orders = await this.prisma.$transaction(
      async (tx) => {
        const createdOrders = [];

        for (const group of cartSummary.sellerGroups) {
          // Re-validate each product within the transaction for consistency
          for (const item of group.items) {
            const product = await tx.product.findUnique({
              where: { id: item.product.id },
              select: {
                id: true,
                status: true,
                quantity: true,
                deletedAt: true,
                priceCDF: true,
                priceUSD: true,
                title: true,
                images: {
                  select: { thumbnailUrl: true },
                  orderBy: { displayOrder: 'asc' },
                  take: 1,
                },
              },
            });

            if (
              !product ||
              product.deletedAt !== null ||
              product.status !== ProductStatus.ACTIVE
            ) {
              const name = item.product.title || 'Produit';
              throw new BadRequestException(
                `Le produit "${name}" n'est plus disponible`,
              );
            }

            if (item.quantity > product.quantity) {
              const name = product.title || 'Produit';
              throw new BadRequestException(
                `Stock insuffisant pour "${name}". Disponible : ${product.quantity}, demandé : ${item.quantity}`,
              );
            }
          }

          // Delivery fee — SINGLE source of truth, shared with quote() so the
          // previewed fee always equals the charged fee. If no active zone
          // covers the route we BLOCK the order rather than undercharge.
          const {
            cdf: deliveryFeeCDF,
            usd: deliveryFeeUSD,
            found: deliveryAvailable,
          } = await this.resolveDeliveryFee(group.sellerId, buyerTown, tx);
          if (!deliveryAvailable) {
            throw new BadRequestException(
              'Aucune zone de livraison disponible pour cette adresse. Veuillez vérifier votre ville de livraison.',
            );
          }

          // Calculate subtotals
          let subtotalCDF = BigInt(0);
          let subtotalUSD: bigint | null = BigInt(0);
          let hasAllUSD = true;

          const orderItemsData = [];

          for (const item of group.items) {
            const product = await tx.product.findUniqueOrThrow({
              where: { id: item.product.id },
              select: {
                id: true,
                priceCDF: true,
                priceUSD: true,
                discountPriceCDF: true,
                discountPriceUSD: true,
                title: true,
                images: {
                  select: { thumbnailUrl: true },
                  orderBy: { displayOrder: 'asc' },
                  take: 1,
                },
              },
            });

            // Charge the effective (discounted) price; snapshot the original
            // list price only when a discount applied (else null = no discount).
            const unitPriceCDF = product.discountPriceCDF ?? product.priceCDF;
            const unitPriceUSD = product.discountPriceUSD ?? product.priceUSD;
            const listUnitPriceCDF =
              product.discountPriceCDF !== null ? product.priceCDF : null;
            const listUnitPriceUSD =
              product.discountPriceUSD !== null ? product.priceUSD : null;

            const itemTotalCDF = unitPriceCDF * BigInt(item.quantity);
            const itemTotalUSD = unitPriceUSD
              ? unitPriceUSD * BigInt(item.quantity)
              : null;

            subtotalCDF += itemTotalCDF;
            if (unitPriceUSD && subtotalUSD !== null) {
              subtotalUSD += unitPriceUSD * BigInt(item.quantity);
            } else {
              hasAllUSD = false;
              subtotalUSD = null;
            }

            orderItemsData.push({
              productId: product.id,
              quantity: item.quantity,
              unitPriceCDF,
              unitPriceUSD,
              listUnitPriceCDF,
              listUnitPriceUSD,
              totalCDF: itemTotalCDF,
              totalUSD: itemTotalUSD,
              productTitle: product.title,
              productImage: product.images[0]?.thumbnailUrl ?? null,
            });

            // Decrement product stock atomically
            await tx.product.update({
              where: { id: product.id },
              data: { quantity: { decrement: item.quantity } },
            });
          }

          // Calculate totals
          const totalCDF = subtotalCDF + deliveryFeeCDF;
          const totalUSD =
            hasAllUSD && subtotalUSD !== null && deliveryFeeUSD !== null
              ? subtotalUSD + deliveryFeeUSD
              : null;

          // Generate order number: TK-YYYYMMDD-XXXX
          const orderNumber = await this.generateOrderNumber(tx);

          // Determine initial payment status
          const paymentStatus = PaymentStatus.PENDING;

          // Create order
          const order = await tx.order.create({
            data: {
              orderNumber,
              checkoutGroupId,
              buyerId: userId,
              sellerId: group.sellerId,
              status: OrderStatus.PENDING,
              paymentMethod: dto.paymentMethod,
              paymentStatus,
              deliveryAddressId: address.id,
              // Freeze the address as it is right now. The buyer has a single
              // editable address, so without this every later edit would
              // retroactively rewrite this order's delivery address.
              ...deliveryAddressSnapshot(address),
              deliveryFeeCDF,
              deliveryFeeUSD: deliveryFeeUSD,
              subtotalCDF,
              subtotalUSD: hasAllUSD ? subtotalUSD : null,
              totalCDF,
              totalUSD,
              idempotencyKey: dto.idempotencyKey,
              buyerNote: dto.buyerNote,
              items: {
                create: orderItemsData,
              },
              statusLogs: {
                create: {
                  fromStatus: null,
                  toStatus: OrderStatus.PENDING,
                  changedBy: userId,
                  note: 'Commande créée',
                },
              },
            },
            include: {
              items: true,
              seller: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  sellerProfile: { select: { businessName: true } },
                },
              },
              deliveryAddress: true,
              statusLogs: true,
            },
          });

          createdOrders.push(order);
        }

        // Clear the cart after successful order creation
        const cart = await tx.cart.findUnique({ where: { userId } });
        if (cart) {
          await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        }

        return createdOrders;
      },
      // Cap how long this holds a pooled connection. 30s is ample for creating
      // a handful of per-seller orders; failing fast frees the connection back
      // to the (small) pool instead of starving trivial reads for 2 minutes.
      { timeout: 30000, maxWait: 10000 },
    );

    this.logger.log(
      `Checkout completed: ${orders.length} order(s) created for user ${userId}, group ${checkoutGroupId}`,
    );

    // Fire-and-forget: send SMS notifications for each created order
    Promise.all(
      orders.map((order) => this.notificationService.notifyOrderPlaced(order)),
    ).catch((err) =>
      this.logger.error('Échec des notifications de commande passée', err),
    );

    // COD-only since 2026-05-26 (PR B2). Create pending COD transaction
    // records — marked COMPLETED by SellerOrdersService on delivery.
    for (const order of orders) {
      this.paymentsService
        .createCodTransaction(order.id, order.totalCDF, order.totalUSD)
        .catch((err) =>
          this.logger.error(
            `COD transaction creation failed for ${order.orderNumber}: ${err}`,
          ),
        );
    }

    // Server-owned ecommerce events (Event Ownership Matrix): one
    // `order_created` per seller-order, plus `payment_attempted` for the
    // pending COD transaction. Fire-and-forget; BigInt centimes → Number.
    for (const order of orders) {
      this.analytics.capture(userId, 'order_created', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        sellerId: order.sellerId,
        item_count: order.items.length,
        total_cdf: Number(order.totalCDF),
        payment_method: order.paymentMethod,
      });
      this.analytics.capture(userId, 'payment_attempted', {
        orderId: order.id,
        method: order.paymentMethod,
        amount_cdf: Number(order.totalCDF),
      });
    }

    return {
      orders,
      checkoutGroupId,
      isIdempotent: false,
      paymentPending: false,
    };
  }

  /**
   * Resolve a seller's delivery fee to a buyer town. **Single source of truth**
   * for the delivery fee — called by both `checkout()` (to charge) and
   * `quote()` (to preview), so the previewed fee always equals the charged fee.
   * `fromTown` = seller's city name → location → 'Lubumbashi'; `toTown` = the
   * buyer's address town.
   */
  private async resolveDeliveryFee(
    sellerId: string,
    toTown: string,
    db: TxClient = this.prisma,
  ): Promise<{
    cdf: bigint;
    usd: bigint | null;
    found: boolean;
    fromTown: string;
  }> {
    const sellerProfile = await db.sellerProfile.findFirst({
      where: { userId: sellerId },
      select: { location: true, city: { select: { name: true } } },
    });
    const fromTown =
      sellerProfile?.city?.name ?? sellerProfile?.location ?? 'Lubumbashi';
    const estimate = await this.deliveryZonesService.estimateFee(
      fromTown,
      toTown,
    );
    return {
      cdf: estimate.data.found ? BigInt(estimate.data.feeCDF!) : BigInt(0),
      usd: estimate.data.feeUSD ? BigInt(estimate.data.feeUSD) : null,
      found: estimate.data.found,
      // The seller's origin town — the client compares it against the delivery
      // town to warn (non-blocking) that transport cost may rise on a mismatch.
      fromTown,
    };
  }

  /**
   * Checkout **quote**: previews the per-seller subtotal + delivery fee + total
   * for the buyer's current cart and a chosen delivery address — without
   * creating any order, mutating stock, or consuming an idempotency key. The
   * delivery fee comes from `resolveDeliveryFee` (the same call `checkout()`
   * makes), so the previewed `deliveryFeeCDF` equals what the order is charged.
   */
  async quote(userId: string, deliveryAddressId: string) {
    const cartSummary = await this.cartService.getCartSummary(userId);
    if (cartSummary.items.length === 0) {
      throw new BadRequestException('Votre panier est vide');
    }

    const address = await this.prisma.address.findFirst({
      where: { id: deliveryAddressId, userId, deletedAt: null },
      include: { city: { select: { name: true } } },
    });
    if (!address) {
      throw new NotFoundException('Adresse de livraison non trouvée');
    }
    const buyerTown = address.city?.name ?? address.town;

    let subtotalCDF = BigInt(0);
    let deliveryFeeCDF = BigInt(0);
    const sellerQuotes = [];

    for (const group of cartSummary.sellerGroups) {
      const fee = await this.resolveDeliveryFee(group.sellerId, buyerTown);
      // No zone → this seller can't be delivered to this address. Surface it so
      // buyer-web can block checkout instead of showing a misleading "Gratuit".
      const sellerTotal = group.subtotalCDF + fee.cdf;
      // Non-blocking heads-up: the seller ships from a different town than the
      // delivery address, so transport cost may be higher. Compared case- and
      // whitespace-insensitively to avoid false positives on formatting.
      const townMismatch =
        this.normalizeTown(fee.fromTown) !== this.normalizeTown(buyerTown);
      sellerQuotes.push({
        sellerId: group.sellerId,
        sellerName: group.sellerName,
        itemCount: group.items.reduce((n, i) => n + i.quantity, 0),
        subtotalCDF: group.subtotalCDF.toString(),
        deliveryFeeCDF: fee.found ? fee.cdf.toString() : null,
        deliveryFeeUSD: fee.found ? (fee.usd?.toString() ?? null) : null,
        deliveryAvailable: fee.found,
        fromTown: fee.fromTown,
        townMismatch,
        totalCDF: sellerTotal.toString(),
      });
      subtotalCDF += group.subtotalCDF;
      deliveryFeeCDF += fee.cdf;
    }

    // Return the RAW payload — the global ResponseInterceptor wraps it once as
    // `{ success, data }`. (Returning `{ data: … }` here double-wrapped the
    // response to `data.data`, so clients reading `res.data.sellerQuotes` got
    // undefined and threw — the real cause of the "Gratuit"/"Impossible de
    // calculer" checkout bug.)
    return {
      deliveryAddressId,
      buyerTown,
      subtotalCDF: subtotalCDF.toString(),
      deliveryFeeCDF: deliveryFeeCDF.toString(),
      totalCDF: (subtotalCDF + deliveryFeeCDF).toString(),
      // Overall gate for the buyer-web "Confirmer la commande" button.
      deliveryAvailable: sellerQuotes.every((q) => q.deliveryAvailable),
      // Non-blocking: at least one seller ships from a different town. Clients
      // show a warning card but keep the confirm button enabled.
      townMismatch: sellerQuotes.some((q) => q.townMismatch),
      sellerQuotes,
    };
  }

  /** Case- and whitespace-insensitive town key for mismatch comparison. */
  private normalizeTown(town: string | null | undefined): string {
    return (town ?? '').trim().toLowerCase();
  }

  /**
   * Generates a unique order number: TK-YYYYMMDD-XXXX
   * Retries up to 5 times on collision.
   */
  private async generateOrderNumber(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  ): Promise<string> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const maxRetries = 5;

    for (let i = 0; i < maxRetries; i++) {
      const suffix = randomBytes(2).toString('hex').toUpperCase().slice(0, 4);
      const orderNumber = `${ORDER_PREFIX}-${dateStr}-${suffix}`;

      const existing = await tx.order.findUnique({
        where: { orderNumber },
        select: { id: true },
      });

      if (!existing) {
        return orderNumber;
      }
    }

    // Fallback: use 6 chars for uniqueness
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `${ORDER_PREFIX}-${dateStr}-${suffix}`;
  }
}
