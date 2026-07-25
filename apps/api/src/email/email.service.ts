import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { emailVerificationTemplate } from './templates/verification.template';
import { passwordResetTemplate } from './templates/password-reset.template';
import { welcomeTemplate } from './templates/welcome.template';
import { sellerSetupTemplate } from './templates/seller-setup.template';
import { buyerSetupTemplate } from './templates/buyer-setup.template';
import { buyerClaimTemplate } from './templates/buyer-claim.template';
import {
  contactFormTemplate,
  type ContactFormEmailInput,
} from './templates/contact-form.template';
import { sellerNewOrderTemplate } from './templates/seller-new-order.template';
import { orderConfirmedTemplate } from './templates/order-confirmed.template';
import { orderShippedTemplate } from './templates/order-shipped.template';
import { orderDeliveredTemplate } from './templates/order-delivered.template';
import { orderCancelledTemplate } from './templates/order-cancelled.template';
import { paymentConfirmedTemplate } from './templates/payment-confirmed.template';
import { broadcastTemplate } from './templates/broadcast.template';
import { sellerApplicationApprovedTemplate } from './templates/seller-application-approved.template';
import { sellerApplicationRejectedTemplate } from './templates/seller-application-rejected.template';
import { payoutApprovedTemplate } from './templates/payout-approved.template';
import { payoutPaidTemplate } from './templates/payout-paid.template';
import { payoutRejectedTemplate } from './templates/payout-rejected.template';
import { productApprovedTemplate } from './templates/product-approved.template';
import { productRejectedTemplate } from './templates/product-rejected.template';

/**
 * Buyer-facing order lifecycle events that can be emailed.
 *
 * Used by sendOrderNotification() as the discriminator. Each event maps to
 * exactly one template + subject line. Adding a new event = add a case here
 * + a template file + a switch arm.
 */
export type OrderEmailPayload =
  | { event: 'order_confirmed'; orderNumber: string; orderUrl: string }
  | {
      event: 'order_shipped';
      orderNumber: string;
      orderUrl: string;
      deliveryLocation: string;
    }
  | { event: 'order_delivered'; orderNumber: string; orderUrl: string }
  | {
      event: 'order_cancelled';
      orderNumber: string;
      orderUrl: string;
      reason?: string;
    }
  | {
      event: 'payment_confirmed';
      orderNumber: string;
      orderUrl: string;
      amountCDF: string;
    };

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string;
  private readonly fromAddress: string;
  private readonly isDev: boolean;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('RESEND_API_KEY', '');
    this.fromAddress = this.configService.get<string>(
      'EMAIL_FROM',
      'Teka RDC <noreply@teka.cd>',
    );
    this.isDev = this.configService.get<string>('NODE_ENV') === 'development';
  }

  async sendEmailVerification(
    email: string,
    verificationUrl: string,
  ): Promise<boolean> {
    const subject = 'Vérifiez votre adresse email — Teka RDC';
    const html = emailVerificationTemplate(verificationUrl);
    return this.sendEmail(email, subject, html);
  }

  async sendPasswordResetEmail(
    email: string,
    resetUrl: string,
  ): Promise<boolean> {
    const expiryMinutes = this.configService.get<number>(
      'PASSWORD_RESET_EXPIRY_MINUTES',
      60,
    );
    const subject = 'Réinitialisation de votre mot de passe — Teka RDC';
    const html = passwordResetTemplate(resetUrl, expiryMinutes);
    return this.sendEmail(email, subject, html);
  }

  async sendWelcomeEmail(
    email: string,
    firstName: string | null,
    verificationUrl: string | null,
  ): Promise<boolean> {
    const subject = 'Bienvenue sur Teka RDC';
    const html = welcomeTemplate(firstName, verificationUrl);
    return this.sendEmail(email, subject, html);
  }

  async sendSellerSetupEmail(
    email: string,
    setupUrl: string,
  ): Promise<boolean> {
    const expiryHours = this.configService.get<number>(
      'SELLER_SETUP_EXPIRY_HOURS',
      24,
    );
    const subject = 'Configurez votre compte vendeur — Teka RDC';
    const html = sellerSetupTemplate(setupUrl, expiryHours);
    return this.sendEmail(email, subject, html);
  }

  async sendSellerApplicationApproved(
    email: string,
    firstName: string | null,
  ): Promise<boolean> {
    const dashboardUrl = this.configService.get<string>(
      'SELLER_WEB_URL',
      'https://seller.teka.cd',
    );
    const subject = 'Votre compte vendeur est approuvé — Teka RDC';
    const html = sellerApplicationApprovedTemplate(firstName, dashboardUrl);
    return this.sendEmail(email, subject, html);
  }

  async sendSellerApplicationRejected(
    email: string,
    firstName: string | null,
    reason: string,
  ): Promise<boolean> {
    const applyUrl = `${this.configService.get<string>(
      'SELLER_WEB_URL',
      'https://seller.teka.cd',
    )}/devenir-vendeur`;
    const subject = 'Votre demande vendeur — Teka RDC';
    const html = sellerApplicationRejectedTemplate(firstName, reason, applyUrl);
    return this.sendEmail(email, subject, html);
  }

  /** Email fallback for the seller "payout approved" event. */
  async sendPayoutApproved(
    email: string,
    firstName: string | null,
    amountLabel: string,
  ): Promise<boolean> {
    const dashboardUrl = this.configService.get<string>(
      'SELLER_WEB_URL',
      'https://seller.teka.cd',
    );
    const subject = 'Retrait approuvé — Teka RDC';
    const html = payoutApprovedTemplate(firstName, amountLabel, dashboardUrl);
    return this.sendEmail(email, subject, html);
  }

  /** Email fallback for the seller "payout paid/completed" event. */
  async sendPayoutPaid(
    email: string,
    firstName: string | null,
    amountLabel: string,
    reference: string,
  ): Promise<boolean> {
    const dashboardUrl = this.configService.get<string>(
      'SELLER_WEB_URL',
      'https://seller.teka.cd',
    );
    const subject = 'Retrait effectué — Teka RDC';
    const html = payoutPaidTemplate(
      firstName,
      amountLabel,
      reference,
      dashboardUrl,
    );
    return this.sendEmail(email, subject, html);
  }

  /** Email fallback for the seller "payout rejected" event. */
  async sendPayoutRejected(
    email: string,
    firstName: string | null,
    amountLabel: string,
    reason: string,
  ): Promise<boolean> {
    const dashboardUrl = this.configService.get<string>(
      'SELLER_WEB_URL',
      'https://seller.teka.cd',
    );
    const subject = 'Demande de retrait refusée — Teka RDC';
    const html = payoutRejectedTemplate(
      firstName,
      amountLabel,
      reason,
      dashboardUrl,
    );
    return this.sendEmail(email, subject, html);
  }

  /** Email fallback for the seller "product approved" event. */
  async sendProductApproved(
    email: string,
    firstName: string | null,
    productName: string,
  ): Promise<boolean> {
    const dashboardUrl = this.configService.get<string>(
      'SELLER_WEB_URL',
      'https://seller.teka.cd',
    );
    const subject = 'Votre produit a été approuvé — Teka RDC';
    const html = productApprovedTemplate(firstName, productName, dashboardUrl);
    return this.sendEmail(email, subject, html);
  }

  /** Email fallback for the seller "product rejected" event. */
  async sendProductRejected(
    email: string,
    firstName: string | null,
    productName: string,
    reason: string,
  ): Promise<boolean> {
    const dashboardUrl = this.configService.get<string>(
      'SELLER_WEB_URL',
      'https://seller.teka.cd',
    );
    const subject = "Votre produit n'a pas été approuvé — Teka RDC";
    const html = productRejectedTemplate(
      firstName,
      productName,
      reason,
      dashboardUrl,
    );
    return this.sendEmail(email, subject, html);
  }

  /** Notifies a seller that a new order has arrived (push + in-app run separately). */
  async sendSellerNewOrder(
    email: string,
    firstName: string | null,
    orderNumber: string,
    itemCount: number,
    subtotalLabel: string,
    buyerTown: string | null,
    orderUrl: string,
  ): Promise<boolean> {
    const subject = `Nouvelle commande ${orderNumber} — Teka RDC`;
    const html = sellerNewOrderTemplate(
      firstName,
      orderNumber,
      itemCount,
      subtotalLabel,
      buyerTown,
      orderUrl,
    );
    return this.sendEmail(email, subject, html);
  }

  async sendBuyerSetupEmail(email: string, setupUrl: string): Promise<boolean> {
    const expiryHours = this.configService.get<number>(
      'BUYER_SETUP_EXPIRY_HOURS',
      24,
    );
    const subject = 'Configurez votre compte Teka RDC';
    const html = buyerSetupTemplate(setupUrl, expiryHours);
    return this.sendEmail(email, subject, html);
  }

  async sendBuyerClaimEmail(email: string, claimUrl: string): Promise<boolean> {
    const expiryHours = this.configService.get<number>(
      'BUYER_SETUP_EXPIRY_HOURS',
      24,
    );
    const subject = 'Réclamez votre compte Teka RDC';
    const html = buyerClaimTemplate(claimUrl, expiryHours);
    return this.sendEmail(email, subject, html);
  }

  /**
   * Confirms that an account deletion has been scheduled. Best-effort — the
   * caller ignores the result. `formattedDate` is the DD/MM/YYYY the account
   * will be permanently anonymized unless the user logs back in first.
   */
  async sendAccountDeletionScheduled(
    email: string,
    formattedDate: string,
  ): Promise<boolean> {
    const subject = 'Suppression de votre compte Teka RDC programmée';
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
        <h2 style="color:#BF0000">Suppression de compte programmée</h2>
        <p>Nous avons bien reçu votre demande de suppression de compte.</p>
        <p>Votre compte sera <strong>désactivé immédiatement</strong> et
        définitivement supprimé le <strong>${formattedDate}</strong>.</p>
        <p>Vous avez changé d'avis ? <strong>Reconnectez-vous simplement avant
        cette date</strong> pour réactiver votre compte et annuler la suppression.</p>
        <p>Certaines informations (commandes, factures) peuvent être conservées
        de façon anonymisée pour respecter nos obligations légales et comptables.</p>
        <p style="color:#6b7280;font-size:13px">Si vous n'êtes pas à l'origine de
        cette demande, reconnectez-vous immédiatement et changez vos identifiants.</p>
      </div>
    `;
    return this.sendEmail(email, subject, html);
  }

  /** Forwards a public contact-form submission to the support inbox. */
  async sendContactNotification(
    input: ContactFormEmailInput & { to: string; replyTo: string },
  ): Promise<boolean> {
    const subject = `[Contact] ${input.subject}`;
    const html = contactFormTemplate(input);
    return this.sendEmail(input.to, subject, html, { replyTo: input.replyTo });
  }

  /**
   * Sends a buyer-facing order-lifecycle email.
   *
   * Used as a fallback by OrderNotificationService when push delivery has no
   * active device token to target. Dispatches on `payload.event` to the
   * matching template + French subject. Caller is responsible for deciding
   * whether to send (push-vs-email gating); this method just renders + sends.
   */
  async sendOrderNotification(
    email: string,
    payload: OrderEmailPayload,
  ): Promise<boolean> {
    switch (payload.event) {
      case 'order_confirmed':
        return this.sendEmail(
          email,
          `Commande ${payload.orderNumber} confirmée — Teka RDC`,
          orderConfirmedTemplate(payload.orderNumber, payload.orderUrl),
        );
      case 'order_shipped':
        return this.sendEmail(
          email,
          `Commande ${payload.orderNumber} expédiée — Teka RDC`,
          orderShippedTemplate(
            payload.orderNumber,
            payload.orderUrl,
            payload.deliveryLocation,
          ),
        );
      case 'order_delivered':
        return this.sendEmail(
          email,
          `Commande ${payload.orderNumber} livrée — Teka RDC`,
          orderDeliveredTemplate(payload.orderNumber, payload.orderUrl),
        );
      case 'order_cancelled':
        return this.sendEmail(
          email,
          `Commande ${payload.orderNumber} annulée — Teka RDC`,
          orderCancelledTemplate(
            payload.orderNumber,
            payload.orderUrl,
            payload.reason,
          ),
        );
      case 'payment_confirmed':
        return this.sendEmail(
          email,
          `Paiement reçu — Commande ${payload.orderNumber} — Teka RDC`,
          paymentConfirmedTemplate(
            payload.orderNumber,
            payload.orderUrl,
            payload.amountCDF,
          ),
        );
    }
  }

  /**
   * Sends an admin-authored broadcast email.
   *
   * Used by BroadcastsService as one of three parallel fan-out channels
   * (push + email + sms). Caller is responsible for opt-out checks; this
   * method just renders + sends. Title is used as the subject line; message
   * is rendered as the body (admin-authored newlines preserved as <br>).
   */
  async sendBroadcast(
    email: string,
    payload: { title: string; message: string },
  ): Promise<boolean> {
    return this.sendEmail(
      email,
      payload.title,
      broadcastTemplate(payload.title, payload.message),
    );
  }

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
    options: { replyTo?: string } = {},
  ): Promise<boolean> {
    if (this.isDev) {
      this.logger.log(`[DEV] Email to ${to}: ${subject}`);
      return true;
    }

    if (!this.apiKey) {
      this.logger.warn('RESEND_API_KEY not configured. Email not sent.');
      return false;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [to],
          subject,
          html,
          ...(options.replyTo ? { reply_to: options.replyTo } : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(
          `Resend API error: ${response.status} - ${JSON.stringify(errorData)}`,
        );
        return false;
      }

      const data = await response.json();
      this.logger.log(`Email sent to ${to}: ${data.id}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to}`,
        error instanceof Error ? error.message : error,
      );
      return false;
    }
  }
}
