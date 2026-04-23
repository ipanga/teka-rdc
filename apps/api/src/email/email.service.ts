import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { otpEmailTemplate } from './templates/otp.template';
import { emailVerificationTemplate } from './templates/verification.template';
import { passwordResetTemplate } from './templates/password-reset.template';
import { welcomeTemplate } from './templates/welcome.template';
import { sellerSetupTemplate } from './templates/seller-setup.template';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string;
  private readonly fromAddress: string;
  private readonly isDev: boolean;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('RESEND_API_KEY', '');
    this.fromAddress = this.configService.get<string>('EMAIL_FROM', 'Teka RDC <noreply@teka.cd>');
    this.isDev = this.configService.get<string>('NODE_ENV') === 'development';
  }

  async sendOtpEmail(email: string, code: string): Promise<boolean> {
    const subject = `Votre code Teka RDC: ${code}`;
    const html = otpEmailTemplate(code, this.configService.get('OTP_EXPIRY_MINUTES', 5));
    return this.sendEmail(email, subject, html);
  }

  async sendEmailVerification(email: string, verificationUrl: string): Promise<boolean> {
    const subject = 'Vérifiez votre adresse email — Teka RDC';
    const html = emailVerificationTemplate(verificationUrl);
    return this.sendEmail(email, subject, html);
  }

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
    const expiryMinutes = this.configService.get<number>('PASSWORD_RESET_EXPIRY_MINUTES', 60);
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

  async sendSellerSetupEmail(email: string, setupUrl: string): Promise<boolean> {
    const expiryHours = this.configService.get<number>('SELLER_SETUP_EXPIRY_HOURS', 24);
    const subject = 'Configurez votre compte vendeur — Teka RDC';
    const html = sellerSetupTemplate(setupUrl, expiryHours);
    return this.sendEmail(email, subject, html);
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
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
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [to],
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(`Resend API error: ${response.status} - ${JSON.stringify(errorData)}`);
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
