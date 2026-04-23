import { Injectable, Logger } from '@nestjs/common';
import type { SmsProvider, SmsSendResult } from '../interfaces/sms-provider.interface';

@Injectable()
export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockSmsProvider.name);

  async sendSms(phone: string, message: string): Promise<SmsSendResult> {
    this.logger.log(`[MOCK SMS] to ${phone}: ${message}`);
    return { ok: true, messageId: `mock-${Date.now()}` };
  }
}
