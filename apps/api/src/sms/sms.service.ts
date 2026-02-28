import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiKey: string;
  private readonly username: string;
  private readonly senderId: string;
  private readonly isDev: boolean;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('AT_API_KEY', '');
    this.username = this.configService.get<string>('AT_USERNAME', 'teka_rdc');
    this.senderId = this.configService.get<string>('AT_SENDER_ID', 'TekaRDC');
    this.isDev = this.configService.get<string>('NODE_ENV') === 'development';
  }

  async sendOtp(phone: string, code: string): Promise<boolean> {
    const message = `Votre code Teka RDC: ${code}. Valide ${this.configService.get('OTP_EXPIRY_MINUTES', 5)} minutes. Ne partagez ce code avec personne.`;

    if (this.isDev) {
      this.logger.log(`[DEV] SMS to ${phone}: ${message}`);
      return true;
    }

    if (!this.apiKey) {
      this.logger.warn('AT_API_KEY not configured. SMS not sent.');
      return false;
    }

    try {
      const response = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'apiKey': this.apiKey,
        },
        body: new URLSearchParams({
          username: this.username,
          to: phone,
          message,
          from: this.senderId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Africa's Talking API error: ${response.status} - ${errorText}`);
        return false;
      }

      const data = await response.json();
      this.logger.log(`SMS sent to ${phone}: ${JSON.stringify(data)}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send SMS to ${phone}`,
        error instanceof Error ? error.message : error,
      );
      return false;
    }
  }

  async sendSms(phone: string, message: string): Promise<boolean> {
    if (this.isDev) {
      this.logger.log(`[DEV] SMS to ${phone}: ${message}`);
      return true;
    }

    if (!this.apiKey) {
      this.logger.warn('AT_API_KEY not configured. SMS not sent.');
      return false;
    }

    try {
      const response = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'apiKey': this.apiKey,
        },
        body: new URLSearchParams({
          username: this.username,
          to: phone,
          message,
          from: this.senderId,
        }),
      });

      if (!response.ok) {
        this.logger.error(`SMS send failed: ${response.status}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send SMS to ${phone}`,
        error instanceof Error ? error.message : error,
      );
      return false;
    }
  }
}
