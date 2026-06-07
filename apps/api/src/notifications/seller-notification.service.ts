import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationPrefsService } from '../users/notification-prefs.service';
import { PushService, PushPayload } from '../push/push.service';

/**
 * Push-only notifications for seller-specific events that don't fit
 * the existing `OrderNotificationService` model. Mirrors that
 * service's fire-and-forget shape — every method catches and logs
 * internally, never throws, so notification failures can't block
 * the main flow.
 *
 * Why a separate service rather than methods on
 * OrderNotificationService:
 *   - OrderNotificationService is keyed on order lifecycle events
 *     and integrates SMS + push for the same payload. The events
 *     here (product approval, reviews) are admin- or buyer-driven
 *     and don't have a natural SMS pair.
 *   - Keeping product/review flows from depending on the SMS infra
 *     means a future SMS-channel deprecation doesn't ripple through.
 *
 * Opt-out semantics:
 *   - Product approval/rejection: NO pref check — these are
 *     operational notifications about the seller's own catalogue.
 *     They never spam.
 *   - New review: gated by `shouldSendOrderUpdates(sellerId)`, the
 *     closest existing semantic match. Add a dedicated
 *     `shouldSendReviewUpdates` pref later if sellers ask for it.
 */
@Injectable()
export class SellerNotificationService {
  private readonly logger = new Logger(SellerNotificationService.name);

  constructor(
    private prisma: PrismaService,
    private notificationPrefs: NotificationPrefsService,
    private pushService: PushService,
  ) {}

  /**
   * Notifies the seller that one of their products has been approved
   * by an admin. Triggered from AdminProductsService.approveProduct.
   *
   * Caller may pass the product directly (with `sellerId` + a
   * `title` / `name`) or just the ID — we accept both shapes.
   */
  async notifyProductApproved(product: {
    id: string;
    sellerId: string;
    title?: string | null;
    name?: string | null;
  }): Promise<void> {
    try {
      const productName = this.resolveProductLabel(product);
      this.sendPushToSeller(product.sellerId, {
        title: 'Produit approuvé',
        body: `${productName} a été approuvé et est maintenant en vente.`,
        data: {
          productId: product.id,
          screen: 'product-details',
          event: 'product-approved',
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Échec de notification approbation produit ${product.id}: ${error?.message ?? error}`,
        error?.stack,
      );
    }
  }

  /**
   * Notifies the seller that one of their products has been rejected
   * by an admin. Includes the rejection reason in the body so the
   * seller doesn't have to open the app to learn why.
   */
  async notifyProductRejected(
    product: {
      id: string;
      sellerId: string;
      title?: string | null;
      name?: string | null;
    },
    rejectionReason: string,
  ): Promise<void> {
    try {
      const productName = this.resolveProductLabel(product);
      // FCM has a soft cap of ~4KB on notification payloads. Truncate
      // long admin-supplied reasons to keep the body readable.
      const truncatedReason =
        rejectionReason.length > 140
          ? rejectionReason.slice(0, 137) + '…'
          : rejectionReason;
      this.sendPushToSeller(product.sellerId, {
        title: 'Produit rejeté',
        body: `${productName} a été rejeté. Raison : ${truncatedReason}`,
        data: {
          productId: product.id,
          screen: 'product-details',
          event: 'product-rejected',
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Échec de notification rejet produit ${product.id}: ${error?.message ?? error}`,
        error?.stack,
      );
    }
  }

  /**
   * Notifies the seller that a buyer left a new review on one of
   * their products. Gated by the seller's order-updates pref —
   * users opting out of order SMS probably don't want review pings
   * either.
   */
  async notifyNewReview(review: {
    id: string;
    rating: number;
    productId: string;
  }): Promise<void> {
    try {
      // Fetch product to resolve seller + display label. Reviews are
      // low-volume vs orders so the extra round-trip is fine.
      const product = await this.prisma.product.findUnique({
        where: { id: review.productId, deletedAt: null },
        select: { id: true, sellerId: true, title: true },
      });
      if (!product) return;

      const optedIn = await this.notificationPrefs.shouldSendOrderUpdates(
        product.sellerId,
      );
      if (!optedIn) return;

      const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
      this.sendPushToSeller(product.sellerId, {
        title: 'Nouvel avis client',
        body: `${stars} sur ${product.title ?? 'votre produit'}.`,
        data: {
          productId: product.id,
          reviewId: review.id,
          screen: 'product-reviews',
          event: 'new-review',
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Échec de notification nouvel avis ${review.id}: ${error?.message ?? error}`,
        error?.stack,
      );
    }
  }

  /**
   * Notifies a seller that their business application was approved.
   * Triggered from AdminUsersService.reviewSellerApplication. No pref
   * check — an operational notification about the seller's own account.
   */
  async notifyApplicationApproved(sellerId: string): Promise<void> {
    try {
      this.sendPushToSeller(sellerId, {
        title: 'Compte vendeur approuvé',
        body: 'Votre demande a été approuvée. Vous pouvez maintenant ajouter vos produits.',
        data: { screen: 'dashboard', event: 'seller-approved' },
      });
    } catch (error: any) {
      this.logger.error(
        `Échec de notification approbation vendeur ${sellerId}: ${error?.message ?? error}`,
        error?.stack,
      );
    }
  }

  /**
   * Notifies a seller that their business application was rejected,
   * including the (truncated) reason so they don't have to open the app.
   */
  async notifyApplicationRejected(
    sellerId: string,
    rejectionReason: string,
  ): Promise<void> {
    try {
      const truncatedReason =
        rejectionReason.length > 140
          ? rejectionReason.slice(0, 137) + '…'
          : rejectionReason;
      this.sendPushToSeller(sellerId, {
        title: 'Demande vendeur refusée',
        body: `Votre demande n'a pas été approuvée. Raison : ${truncatedReason}`,
        data: { screen: 'seller-application', event: 'seller-rejected' },
      });
    } catch (error: any) {
      this.logger.error(
        `Échec de notification rejet vendeur ${sellerId}: ${error?.message ?? error}`,
        error?.stack,
      );
    }
  }

  private sendPushToSeller(sellerId: string, payload: PushPayload): void {
    void this.pushService.sendToUser(sellerId, payload).catch((err) => {
      this.logger.warn(
        `push send failed for seller ${sellerId}: ${err?.message ?? err}`,
      );
    });
  }

  private resolveProductLabel(p: {
    title?: string | null;
    name?: string | null;
  }): string {
    return (p.title ?? p.name ?? 'Votre produit').trim() || 'Votre produit';
  }
}
