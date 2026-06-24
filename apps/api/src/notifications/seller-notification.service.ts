import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationPrefsService } from '../users/notification-prefs.service';
import { PushService, PushPayload } from '../push/push.service';
import { EmailService } from '../email/email.service';
import { UserNotificationService } from './user-notification.service';

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
    private emailService: EmailService,
    private userNotifications: UserNotificationService,
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
      const body = `${productName} a été approuvé et est maintenant en vente.`;

      // 1) In-app feed entry — the durable record the seller sees in their
      //    notification center (web + mobile).
      await this.userNotifications.create({
        userId: product.sellerId,
        type: 'PRODUCT_APPROVED',
        title: 'Produit approuvé',
        body,
        entityType: 'product',
        entityId: product.id,
      });

      // 2) Push-primary + email-fallback (email only when the seller has no
      //    active device — mirrors the payout pattern).
      const user = await this.loadSellerUser(product.sellerId);
      if (!user) return;
      await this.pushOrEmailToSeller(
        user,
        {
          title: 'Produit approuvé',
          body,
          data: {
            productId: product.id,
            screen: 'product-details',
            event: 'product-approved',
          },
        },
        (email, firstName) =>
          this.emailService.sendProductApproved(email, firstName, productName),
      );
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
      // FCM has a soft cap of ~4KB on notification payloads. Truncate long
      // admin-supplied reasons for the push/in-app body; the email carries
      // the full reason.
      const shortReason =
        rejectionReason.length > 140
          ? rejectionReason.slice(0, 137) + '…'
          : rejectionReason;
      const body = `${productName} a été rejeté. Raison : ${shortReason}`;

      // 1) In-app feed entry.
      await this.userNotifications.create({
        userId: product.sellerId,
        type: 'PRODUCT_REJECTED',
        title: 'Produit rejeté',
        body,
        entityType: 'product',
        entityId: product.id,
      });

      // 2) Push-primary + email-fallback (full reason in the email).
      const user = await this.loadSellerUser(product.sellerId);
      if (!user) return;
      await this.pushOrEmailToSeller(
        user,
        {
          title: 'Produit rejeté',
          body,
          data: {
            productId: product.id,
            screen: 'product-details',
            event: 'product-rejected',
          },
        },
        (email, firstName) =>
          this.emailService.sendProductRejected(
            email,
            firstName,
            productName,
            rejectionReason,
          ),
      );
    } catch (error: any) {
      this.logger.error(
        `Échec de notification rejet produit ${product.id}: ${error?.message ?? error}`,
        error?.stack,
      );
    }
  }

  /**
   * Notifies a seller their published product was suspended (admin takedown).
   * In-app feed entry + push. Reuses the PRODUCT_REJECTED feed type (same
   * negative-event deep-link to the product); the copy says "suspendu".
   */
  async notifyProductSuspended(
    product: {
      id: string;
      sellerId: string;
      title?: string | null;
      name?: string | null;
    },
    reason: string,
  ): Promise<void> {
    try {
      const productName = this.resolveProductLabel(product);
      const shortReason =
        reason.length > 140 ? reason.slice(0, 137) + '…' : reason;
      const body = `${productName} a été suspendu. Raison : ${shortReason}`;

      await this.userNotifications.create({
        userId: product.sellerId,
        type: 'PRODUCT_REJECTED',
        title: 'Produit suspendu',
        body,
        entityType: 'product',
        entityId: product.id,
      });

      const user = await this.loadSellerUser(product.sellerId);
      if (!user) return;
      await this.pushService
        .sendToUser(user.id, {
          title: 'Produit suspendu',
          body,
          data: {
            productId: product.id,
            screen: 'product-details',
            event: 'product-suspended',
          },
        })
        .catch(() => {});
    } catch (error: any) {
      this.logger.error(
        `Échec de notification suspension produit ${product.id}: ${error?.message ?? error}`,
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

  /**
   * Notifies a seller that their payout was approved. Unlike the other
   * seller events (push-only), payout events are money events and use
   * push-primary + EMAIL FALLBACK — sellers always have an email (email+
   * password auth), and missing a "you've been paid" message is worse than a
   * little channel overlap. No pref gate: operational notification about the
   * seller's own money.
   */
  async notifyPayoutApproved(payoutId: string): Promise<void> {
    try {
      const ctx = await this.loadPayoutContext(payoutId);
      if (!ctx) return;
      const { user, amountLabel } = ctx;
      await this.pushOrEmailToSeller(
        user,
        {
          title: 'Retrait approuvé',
          body: `Votre demande de retrait de ${amountLabel} a été approuvée.`,
          data: { screen: 'earnings', event: 'payout-approved', payoutId },
        },
        (email, firstName) =>
          this.emailService.sendPayoutApproved(email, firstName, amountLabel),
      );
    } catch (error: any) {
      this.logger.error(
        `Échec notification retrait approuvé ${payoutId}: ${error?.message ?? error}`,
        error?.stack,
      );
    }
  }

  /** Notifies a seller that their payout was paid out (with the reference). */
  async notifyPayoutPaid(payoutId: string): Promise<void> {
    try {
      const ctx = await this.loadPayoutContext(payoutId);
      if (!ctx) return;
      const { user, amountLabel, reference } = ctx;
      const ref = reference ?? '—';
      await this.pushOrEmailToSeller(
        user,
        {
          title: 'Retrait effectué',
          body: `Votre retrait de ${amountLabel} a été effectué. Référence : ${ref}`,
          data: { screen: 'earnings', event: 'payout-paid', payoutId },
        },
        (email, firstName) =>
          this.emailService.sendPayoutPaid(email, firstName, amountLabel, ref),
      );
    } catch (error: any) {
      this.logger.error(
        `Échec notification retrait effectué ${payoutId}: ${error?.message ?? error}`,
        error?.stack,
      );
    }
  }

  /** Notifies a seller that their payout was rejected (with the reason). */
  async notifyPayoutRejected(payoutId: string): Promise<void> {
    try {
      const ctx = await this.loadPayoutContext(payoutId);
      if (!ctx) return;
      const { user, amountLabel, reason } = ctx;
      const fullReason = reason ?? 'Non précisée';
      // FCM has a soft cap on payload size; keep the push body readable.
      const pushReason =
        fullReason.length > 140 ? fullReason.slice(0, 137) + '…' : fullReason;
      await this.pushOrEmailToSeller(
        user,
        {
          title: 'Retrait refusé',
          body: `Votre demande de retrait de ${amountLabel} a été refusée. Raison : ${pushReason}`,
          data: { screen: 'earnings', event: 'payout-rejected', payoutId },
        },
        (email, firstName) =>
          this.emailService.sendPayoutRejected(
            email,
            firstName,
            amountLabel,
            fullReason,
          ),
      );
    } catch (error: any) {
      this.logger.error(
        `Échec notification retrait refusé ${payoutId}: ${error?.message ?? error}`,
        error?.stack,
      );
    }
  }

  /**
   * Loads the seller user + a formatted amount label for a payout. Returns
   * null when the payout or its seller user can't be resolved.
   */
  private async loadPayoutContext(payoutId: string): Promise<{
    user: { id: string; email: string | null; firstName: string | null };
    amountLabel: string;
    reference: string | null;
    reason: string | null;
  } | null> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      select: {
        amountCDF: true,
        externalReference: true,
        rejectionReason: true,
        sellerProfile: {
          select: {
            user: {
              select: { id: true, email: true, firstName: true },
            },
          },
        },
      },
    });
    if (!payout?.sellerProfile?.user) return null;
    return {
      user: payout.sellerProfile.user,
      amountLabel: this.formatCdf(payout.amountCDF),
      reference: payout.externalReference,
      reason: payout.rejectionReason,
    };
  }

  /**
   * Loads a seller's user row (id + email + firstName) for push/email
   * fan-out. `sellerId` on a Product is the seller's User id (the same id
   * PushService.sendToUser + DeviceToken.userId use).
   */
  private async loadSellerUser(sellerId: string): Promise<{
    id: string;
    email: string | null;
    firstName: string | null;
  } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: sellerId, deletedAt: null },
      select: { id: true, email: true, firstName: true },
    });
    return user ?? null;
  }

  /** Format BigInt centimes as a French CDF label, e.g. "63 000 CDF". */
  private formatCdf(centimes: bigint): string {
    return `${(Number(centimes) / 100).toLocaleString('fr-FR')} CDF`;
  }

  /**
   * Push-primary with email fallback for a seller, mirroring
   * OrderNotificationService.pushOrEmail but for the seller side (payout
   * events only). Email is sent only when push reaches 0 devices.
   */
  private async pushOrEmailToSeller(
    user: { id: string; email: string | null; firstName: string | null },
    push: PushPayload,
    emailFn: (email: string, firstName: string | null) => Promise<boolean>,
  ): Promise<void> {
    let pushSucceeded = false;
    try {
      const result = await this.pushService.sendToUser(user.id, push);
      pushSucceeded = result.succeeded > 0;
    } catch (err: any) {
      this.logger.warn(
        `payout push failed for seller ${user.id}: ${err?.message ?? err}`,
      );
    }
    if (pushSucceeded) return;
    if (!user.email) {
      this.logger.warn(
        `seller ${user.id} has no active push token and no email — payout notification not delivered`,
      );
      return;
    }
    try {
      await emailFn(user.email, user.firstName);
    } catch (err: any) {
      this.logger.warn(
        `payout email fallback failed for seller ${user.id}: ${err?.message ?? err}`,
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
