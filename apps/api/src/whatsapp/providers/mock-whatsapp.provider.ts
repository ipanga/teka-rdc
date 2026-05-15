import { Injectable, Logger } from '@nestjs/common';
import type {
  WhatsappProvider,
  WhatsappSendResult,
} from '../interfaces/whatsapp-provider.interface';

@Injectable()
export class MockWhatsappProvider implements WhatsappProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockWhatsappProvider.name);

  async sendOtpTemplate(
    phone: string,
    code: string,
  ): Promise<WhatsappSendResult> {
    this.logger.log(`[MOCK WHATSAPP OTP] phone=${phone} code=${code}`);
    return { ok: true, messageId: `mock-${Date.now()}` };
  }
}
