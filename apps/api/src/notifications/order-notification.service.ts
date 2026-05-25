import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationPrefsService } from '../users/notification-prefs.service';
import { PushService, PushPayload } from '../push/push.service';
import { EmailService, OrderEmailPayload } from '../email/email.service';

/**
 * Handles notifications for order lifecycle events.
 *
 * Buyer notifications: push (FCM) primary, email (Resend) fallback when no
 * active device token responds. Sellers: push only — operational users who
 * should have the mobile app installed.
 *
 * All methods are fire-and-forget at the call-site: they catch + log errors
 * internally and never throw, so notifications never block or break the
 * main order flow.
 *
 * Per-user opt-out via NotificationPrefsService. Default opt-in.
 *
 * NB. Until 2026-05-25 this service had a `sendSms()` private that was
 * actually just a `logger.log` stub — never wired to any SMS provider.
 * Removed in PR A2 of the Orange/AT/Flexpay-removal initiative. Real SMS
 * has been a no-op here for months.
 */
@Injectable()
export class OrderNotificationService {
  private readonly logger = new Logger(OrderNotificationService.name);
  private readonly buyerWebUrl: string;

  constructor(
    private prisma: PrismaService,
    private notificationPrefs: NotificationPrefsService,
    private pushService: PushService,
    private emailService: EmailService,
    configService: ConfigService,
  ) {
    this.buyerWebUrl = configService
      .get<string>('BUYER_WEB_URL', 'https://teka.cd')
      .replace(/\/$/, '');
  }

  /**
   * Notifies buyer and seller that a new order has been placed.
   *
   * Buyer: push if available, no email fallback for this event (the order
   * confirmation page already serves as the receipt — duplicating to email
   * would feel spammy). Seller: push only.
   */
  async notifyOrderPlaced(order: any): Promise<void> {
    try {
      const enriched = await this.enrichOrder(order);
      if (!enriched) return;

      const { orderNumber, buyer, seller, items } = enriched;
      const totalCDF = this.formatCDF(enriched.totalCDF);
      const subtotalCDF = this.formatCDF(enriched.subtotalCDF);
      const itemCount = items.length;

      if (await this.shouldNotify(buyer)) {
        this.sendPushToBuyer(buyer.id, {
          title: 'Commande enregistrée',
          body: `Commande ${orderNumber} — ${totalCDF} FC. Nous vous tiendrons informé.`,
          data: { orderId: enriched.id, screen: 'order-details' },
        });
      }

      if (await this.shouldNotify(seller)) {
        this.sendPushToSeller(seller.id, {
          title: 'Nouvelle commande',
          body: `Commande ${orderNumber} reçue — ${itemCount} article(s), ${subtotalCDF} FC.`,
          data: { orderId: enriched.id, screen: 'order-details' },
        });
      }
    } catch (error) {
      this.logger.error(
        `Échec de notification pour commande passée: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Notifies buyer that their order has been confirmed by the seller.
   */
  async notifyOrderConfirmed(order: any): Promise<void> {
    try {
      const enriched = await this.enrichOrder(order);
      if (!enriched) return;

      const { orderNumber, buyer } = enriched;
      if (!(await this.shouldNotify(buyer))) return;

      await this.pushOrEmail(
        buyer,
        {
          title: 'Commande confirmée',
          body: `${orderNumber} a été confirmée par le vendeur. Préparation en cours.`,
          data: { orderId: enriched.id, screen: 'order-details' },
        },
        {
          event: 'order_confirmed',
          orderNumber,
          orderUrl: this.orderUrl(enriched.id),
        },
      );
    } catch (error) {
      this.logger.error(
        `Échec de notification pour commande confirmée: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Notifies buyer that their order has been shipped.
   */
  async notifyOrderShipped(order: any): Promise<void> {
    try {
      const enriched = await this.enrichOrder(order);
      if (!enriched) return;

      const { orderNumber, buyer, deliveryAddress } = enriched;
      const town = deliveryAddress?.town ?? '';
      const neighborhood = deliveryAddress?.neighborhood ?? '';
      const locationParts = [town, neighborhood].filter(Boolean).join(', ');

      if (!(await this.shouldNotify(buyer))) return;

      await this.pushOrEmail(
        buyer,
        {
          title: 'Commande expédiée',
          body: locationParts
            ? `${orderNumber} est en route vers ${locationParts}.`
            : `${orderNumber} est en route.`,
          data: { orderId: enriched.id, screen: 'order-details' },
        },
        {
          event: 'order_shipped',
          orderNumber,
          orderUrl: this.orderUrl(enriched.id),
          deliveryLocation: locationParts,
        },
      );
    } catch (error) {
      this.logger.error(
        `Échec de notification pour commande expédiée: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Notifies buyer that their order has been delivered.
   */
  async notifyOrderDelivered(order: any): Promise<void> {
    try {
      const enriched = await this.enrichOrder(order);
      if (!enriched) return;

      const { orderNumber, buyer } = enriched;
      if (!(await this.shouldNotify(buyer))) return;

      await this.pushOrEmail(
        buyer,
        {
          title: 'Commande livrée',
          body: `${orderNumber} a été livrée. Merci pour votre achat sur Teka !`,
          data: { orderId: enriched.id, screen: 'order-details' },
        },
        {
          event: 'order_delivered',
          orderNumber,
          orderUrl: this.orderUrl(enriched.id),
        },
      );
    } catch (error) {
      this.logger.error(
        `Échec de notification pour commande livrée: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Notifies buyer and seller that an order has been cancelled.
   */
  async notifyOrderCancelled(order: any, reason?: string): Promise<void> {
    try {
      const enriched = await this.enrichOrder(order);
      if (!enriched) return;

      const { orderNumber, buyer, seller } = enriched;
      const displayReason =
        reason || enriched.cancellationReason || 'Non spécifiée';

      if (await this.shouldNotify(buyer)) {
        await this.pushOrEmail(
          buyer,
          {
            title: 'Commande annulée',
            body: `${orderNumber} a été annulée. Raison : ${displayReason}.`,
            data: { orderId: enriched.id, screen: 'order-details' },
          },
          {
            event: 'order_cancelled',
            orderNumber,
            orderUrl: this.orderUrl(enriched.id),
            reason: displayReason,
          },
        );
      }

      if (await this.shouldNotify(seller)) {
        this.sendPushToSeller(seller.id, {
          title: 'Commande annulée',
          body: `${orderNumber} a été annulée. Raison : ${displayReason}.`,
          data: { orderId: enriched.id, screen: 'order-details' },
        });
      }
    } catch (error) {
      this.logger.error(
        `Échec de notification pour commande annulée: ${error.message}`,
        error.stack,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Push-first, email-fallback for buyers. Awaits the push so we can read
   * `succeeded`; when zero (no active token, or all tokens FCM-rejected),
   * sends the email instead. Both delivery paths fail-soft — neither
   * throws past this method.
   *
   * Push and email are mutually exclusive on purpose: a buyer with the
   * mobile app installed shouldn't also get an email for the same event
   * (spam). The fallback is only for buyers without a working device token.
   */
  private async pushOrEmail(
    buyer: { id: string; email?: string | null },
    push: PushPayload,
    email: OrderEmailPayload,
  ): Promise<void> {
    let pushSucceeded = false;
    try {
      const result = await this.pushService.sendToUser(buyer.id, push);
      pushSucceeded = result.succeeded > 0;
    } catch (err) {
      this.logger.warn(
        `push send failed for buyer ${buyer.id}: ${(err as Error)?.message ?? err}`,
      );
    }

    if (pushSucceeded) return;

    if (!buyer.email) {
      this.logger.warn(
        `Buyer ${buyer.id} has no active push token and no email — notification not delivered`,
      );
      return;
    }

    try {
      await this.emailService.sendOrderNotification(buyer.email, email);
    } catch (err) {
      this.logger.warn(
        `email fallback failed for buyer ${buyer.id}: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  /**
   * Resolves the "should we notify this party" pref + presence check.
   * Returns false when the party is absent (some orders carry only one
   * side enriched) or has opted out of order updates.
   */
  private async shouldNotify(
    party: { id?: string | null } | null | undefined,
  ): Promise<boolean> {
    if (!party?.id) return false;
    return this.notificationPrefs.shouldSendOrderUpdates(party.id);
  }

  private orderUrl(orderId: string): string {
    return `${this.buyerWebUrl}/orders/${orderId}`;
  }

  /**
   * Ensures the order object has all the data we need for notifications.
   * If the passed-in order already has buyer/seller/deliveryAddress relations,
   * use it directly. Otherwise, re-fetch from the database.
   *
   * 2026-05-25: now also pulls `buyer.email` for the email-fallback path
   * added in PR A2. Seller email is intentionally NOT loaded (sellers stay
   * push-only — operational users with the mobile app).
   */
  private async enrichOrder(order: any): Promise<any | null> {
    // If the order already has the required relations, return it as-is.
    // Note: we now also require buyer.email so the fallback path has a
    // target. The `buyer.email !== undefined` check (vs truthy) lets a
    // legitimately-null email still satisfy the pre-loaded check.
    if (
      order?.buyer?.phone &&
      order?.buyer?.email !== undefined &&
      order?.seller?.phone &&
      order?.deliveryAddress
    ) {
      return order;
    }

    const orderId = order?.id;
    if (!orderId) {
      this.logger.warn('Notification ignorée : ID de commande manquant');
      return null;
    }

    try {
      const fullOrder = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
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
              sellerProfile: {
                select: { businessName: true },
              },
            },
          },
          deliveryAddress: {
            select: {
              town: true,
              neighborhood: true,
            },
          },
          items: {
            select: {
              id: true,
              quantity: true,
              productTitle: true,
            },
          },
        },
      });

      if (!fullOrder) {
        this.logger.warn(
          `Notification ignorée : commande ${orderId} introuvable en base`,
        );
        return null;
      }

      return fullOrder;
    } catch (error) {
      this.logger.error(
        `Impossible de récupérer la commande ${orderId}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Fan out an FCM push to every active device token belonging to the
   * buyer. Fire-and-forget for events that don't need an email-fallback
   * (e.g. notifyOrderPlaced, where the buyer already has the
   * confirmation page in front of them).
   */
  private sendPushToBuyer(buyerId: string, payload: PushPayload): void {
    void this.pushService.sendToUser(buyerId, payload).catch((err) => {
      this.logger.warn(
        `push send failed for buyer ${buyerId}: ${err?.message ?? err}`,
      );
    });
  }

  /**
   * Same fan-out as [sendPushToBuyer] but for the seller side. Kept as a
   * separate helper so future changes (e.g. seller-specific channel ID,
   * different tap-target screen) can land here without touching the
   * buyer path. Sellers do not get an email-fallback path — see class
   * docstring.
   */
  private sendPushToSeller(sellerId: string, payload: PushPayload): void {
    void this.pushService.sendToUser(sellerId, payload).catch((err) => {
      this.logger.warn(
        `push send failed for seller ${sellerId}: ${err?.message ?? err}`,
      );
    });
  }

  /**
   * Formats a BigInt CDF value as a human-readable string.
   * Stored in centimes, displayed in francs.
   */
  private formatCDF(value: bigint | number | null | undefined): string {
    if (value === null || value === undefined) return '0';
    const numeric = typeof value === 'bigint' ? Number(value) : value;
    const francs = Math.round(numeric / 100);
    return francs.toLocaleString('fr-FR');
  }
}
