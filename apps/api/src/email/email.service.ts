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
import { orderConfirmedTemplate } from './templates/order-confirmed.template';
import { orderShippedTemplate } from './templates/order-shipped.template';
import { orderDeliveredTemplate } from './templates/order-delivered.template';
import { orderCancelledTemplate } from './templates/order-cancelled.template';
import { paymentConfirmedTemplate } from './templates/payment-confirmed.template';
import { broadcastTemplate } from './templates/broadcast.template';

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
