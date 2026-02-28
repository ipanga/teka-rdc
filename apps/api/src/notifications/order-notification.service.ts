import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Handles SMS notifications for order lifecycle events.
 *
 * All methods are fire-and-forget: they catch and log errors internally,
 * and never throw. This ensures notifications never block or break
 * the main order flow.
 *
 * Currently uses Logger to output SMS messages. When Africa's Talking
 * is integrated, swap the `sendSms` helper to call the real SMS gateway.
 */
@Injectable()
export class OrderNotificationService {
  private readonly logger = new Logger(OrderNotificationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Notifies buyer and seller that a new order has been placed.
   */
  async notifyOrderPlaced(order: any): Promise<void> {
    try {
      const enriched = await this.enrichOrder(order);
      if (!enriched) return;

      const { orderNumber, buyer, seller, deliveryAddress, items } = enriched;
      const totalCDF = this.formatCDF(enriched.totalCDF);
      const subtotalCDF = this.formatCDF(enriched.subtotalCDF);
      const itemCount = items.length;

      // SMS to buyer
      if (buyer?.phone) {
        const buyerMsg =
          `Votre commande ${orderNumber} a été passée avec succès. ` +
          `Montant: ${totalCDF} FC. ` +
          `Nous vous tiendrons informé de l'avancement.`;
        this.sendSms(buyer.phone, buyerMsg);
      }

      // SMS to seller
      if (seller?.phone) {
        const businessName = seller.sellerProfile?.businessName
          ? ` (${seller.sellerProfile.businessName})`
          : '';
        const sellerMsg =
          `Nouvelle commande ${orderNumber} reçue ! ` +
          `${itemCount} article(s) pour ${subtotalCDF} FC. ` +
          `Veuillez confirmer dans les plus brefs délais.`;
        this.sendSms(seller.phone, sellerMsg);
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

      if (buyer?.phone) {
        const msg =
          `Bonne nouvelle ! Votre commande ${orderNumber} a été confirmée par le vendeur. ` +
          `Préparation en cours.`;
        this.sendSms(buyer.phone, msg);
      }
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

      if (buyer?.phone) {
        const msg =
          `Votre commande ${orderNumber} a été expédiée ! ` +
          `Livraison prévue à ${locationParts}.`;
        this.sendSms(buyer.phone, msg);
      }
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

      if (buyer?.phone) {
        const msg =
          `Votre commande ${orderNumber} a été livrée. ` +
          `Merci pour votre achat sur Teka !`;
        this.sendSms(buyer.phone, msg);
      }
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
      const displayReason = reason || enriched.cancellationReason || 'Non spécifiée';

      const msg =
        `La commande ${orderNumber} a été annulée. ` +
        `Raison: ${displayReason}.`;

      if (buyer?.phone) {
        this.sendSms(buyer.phone, msg);
      }

      if (seller?.phone) {
        this.sendSms(seller.phone, msg);
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
   * Ensures the order object has all the data we need for notifications.
   * If the passed-in order already has buyer/seller/deliveryAddress relations,
   * use it directly. Otherwise, re-fetch from the database.
   */
  private async enrichOrder(order: any): Promise<any | null> {
    // If the order already has the required relations, return it as-is
    if (order?.buyer?.phone && order?.seller?.phone && order?.deliveryAddress) {
      return order;
    }

    // Otherwise, fetch the full order from the database
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
   * Sends an SMS to the given phone number.
   *
   * Currently logs the message. Replace the body of this method with a real
   * SMS gateway call (e.g. Africa's Talking) when ready.
   */
  private sendSms(phone: string, message: string): void {
    this.logger.log(`[SMS -> ${phone}] ${message}`);
  }

  /**
   * Formats a BigInt CDF value as a human-readable string.
   * Stored in centimes, displayed in francs.
   */
  private formatCDF(value: bigint | number | null | undefined): string {
    if (value === null || value === undefined) return '0';
    const numeric = typeof value === 'bigint' ? Number(value) : value;
    // Values are stored in centimes — convert to francs
    const francs = Math.round(numeric / 100);
    return francs.toLocaleString('fr-FR');
  }
}
