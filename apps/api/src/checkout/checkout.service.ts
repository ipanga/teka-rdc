import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { OrderNotificationService } from '../notifications/order-notification.service';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderStatus, PaymentMethod, PaymentStatus, ProductStatus } from '@prisma/client';
import { randomBytes } from 'crypto';

/** Order number prefix */
const ORDER_PREFIX = 'TK';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private prisma: PrismaService,
    private cartService: CartService,
    private deliveryZonesService: DeliveryZonesService,
    private notificationService: OrderNotificationService,
    private paymentsService: PaymentsService,
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
    });

    if (!address) {
      throw new NotFoundException('Adresse de livraison non trouvée');
    }

    // 4. Generate a checkout group ID
    const checkoutGroupId = crypto.randomUUID();

    // 5. Execute everything in a Prisma transaction (30s timeout for slow cloud DB)
    const orders = await this.prisma.$transaction(async (tx) => {
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

          if (!product || product.deletedAt !== null || product.status !== ProductStatus.ACTIVE) {
            const title = item.product.title as any;
            const name = title?.fr || title?.en || 'Produit';
            throw new BadRequestException(
              `Le produit "${name}" n'est plus disponible`,
            );
          }

          if (item.quantity > product.quantity) {
            const title = product.title as any;
            const name = title?.fr || title?.en || 'Produit';
            throw new BadRequestException(
              `Stock insuffisant pour "${name}". Disponible : ${product.quantity}, demandé : ${item.quantity}`,
            );
          }
        }

        // Get seller location for delivery fee estimation
        const sellerProfile = await tx.sellerProfile.findFirst({
          where: { userId: group.sellerId },
          select: { location: true, city: { select: { name: true } } },
        });

        // Estimate delivery fee — use city name if available, fall back to location string
        const cityName = sellerProfile?.city?.name as { fr: string; en?: string } | null;
        const fromTown = cityName?.fr ?? sellerProfile?.location ?? 'Lubumbashi';
        const deliveryEstimate = await this.deliveryZonesService.estimateFee(
          fromTown,
          address.town,
        );
        const deliveryFeeCDF = BigInt(deliveryEstimate.data.feeCDF);
        const deliveryFeeUSD = deliveryEstimate.data.feeUSD
          ? BigInt(deliveryEstimate.data.feeUSD)
          : null;

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
              title: true,
              images: {
                select: { thumbnailUrl: true },
                orderBy: { displayOrder: 'asc' },
                take: 1,
              },
            },
          });

          const itemTotalCDF = product.priceCDF * BigInt(item.quantity);
          const itemTotalUSD = product.priceUSD
            ? product.priceUSD * BigInt(item.quantity)
            : null;

          subtotalCDF += itemTotalCDF;
          if (product.priceUSD && subtotalUSD !== null) {
            subtotalUSD += product.priceUSD * BigInt(item.quantity);
          } else {
            hasAllUSD = false;
            subtotalUSD = null;
          }

          orderItemsData.push({
            productId: product.id,
            quantity: item.quantity,
            unitPriceCDF: product.priceCDF,
            unitPriceUSD: product.priceUSD,
            totalCDF: itemTotalCDF,
            totalUSD: itemTotalUSD,
            productTitle: product.title as object,
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
    }, { timeout: 120000 });

    this.logger.log(
      `Checkout completed: ${orders.length} order(s) created for user ${userId}, group ${checkoutGroupId}`,
    );

    // Fire-and-forget: send SMS notifications for each created order
    Promise.all(
      orders.map((order) => this.notificationService.notifyOrderPlaced(order)),
    ).catch((err) =>
      this.logger.error('Échec des notifications de commande passée', err),
    );

    // Create transaction records and initiate payments
    let paymentPending = false;
    const externalReferences: string[] = [];

    if (dto.paymentMethod === PaymentMethod.MOBILE_MONEY && dto.mobileMoneyProvider && dto.payerPhone) {
      // Initiate Mobile Money payment for each order
      paymentPending = true;
      for (const order of orders) {
        try {
          const result = await this.paymentsService.initiateOrderPayment(
            order.id,
            {
              mobileMoneyProvider: dto.mobileMoneyProvider,
              payerPhone: dto.payerPhone,
            },
          );
          if (result.externalReference) {
            externalReferences.push(result.externalReference);
          }
        } catch (err) {
          this.logger.error(
            `Payment initiation failed for order ${order.orderNumber}: ${err}`,
          );
        }
      }
    } else {
      // COD — create pending COD transaction records
      for (const order of orders) {
        this.paymentsService
          .createCodTransaction(order.id, order.totalCDF, order.totalUSD)
          .catch((err) =>
            this.logger.error(`COD transaction creation failed for ${order.orderNumber}: ${err}`),
          );
      }
    }

    return {
      orders,
      checkoutGroupId,
      isIdempotent: false,
      paymentPending,
      externalReferences: externalReferences.length > 0 ? externalReferences : undefined,
    };
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
