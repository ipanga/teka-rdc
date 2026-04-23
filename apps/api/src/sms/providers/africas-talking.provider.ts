import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  SmsProvider,
  SmsSendResult,
} from '../interfaces/sms-provider.interface';

@Injectable()
export class AfricasTalkingSmsProvider implements SmsProvider {
  readonly name = 'africas_talking';
  private readonly logger = new Logger(AfricasTalkingSmsProvider.name);
  private readonly apiKey: string;
  private readonly username: string;
  private readonly senderId: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('AT_API_KEY', '');
    this.username = configService.get<string>('AT_USERNAME', 'teka_rdc');
    this.senderId = configService.get<string>('AT_SENDER_ID', 'TekaRDC');
  }

  async sendSms(phone: string, message: string): Promise<SmsSendResult> {
    if (!this.apiKey) {
      this.logger.warn('AT_API_KEY not configured. SMS not sent.');
      return { ok: false, error: 'AT_API_KEY missing' };
    }

    try {
      const response = await fetch(
        'https://api.africastalking.com/version1/messaging',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            apiKey: this.apiKey,
          },
          body: new URLSearchParams({
            username: this.username,
            to: phone,
            message,
            from: this.senderId,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Africa's Talking API error: ${response.status} - ${errorText}`,
        );
        return { ok: false, error: `HTTP ${response.status}` };
      }

      const data: {
        SMSMessageData?: { Recipients?: Array<{ messageId?: string }> };
      } = await response.json();
      const messageId = data.SMSMessageData?.Recipients?.[0]?.messageId;
      this.logger.log(
        `SMS sent to ${phone} via Africa's Talking: ${messageId ?? 'ok'}`,
      );
      return { ok: true, messageId };
    } catch (error) {
      this.logger.error(
        `Africa's Talking send failed for ${phone}`,
        error instanceof Error ? error.message : error,
      );
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'unknown',
      };
    }
  }
}
