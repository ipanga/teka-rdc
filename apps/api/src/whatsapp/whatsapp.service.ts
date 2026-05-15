import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WHATSAPP_PROVIDER } from './interfaces/whatsapp-provider.interface';
import type { WhatsappProvider } from './interfaces/whatsapp-provider.interface';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly isDev: boolean;

  constructor(
    private configService: ConfigService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsappProvider,
  ) {
    this.isDev = this.configService.get<string>('NODE_ENV') === 'development';
    this.logger.log(`WhatsApp provider active: ${this.provider.name}`);
  }

  async sendOtp(phone: string, code: string): Promise<boolean> {
    if (this.isDev && this.provider.name !== 'mock') {
      this.logger.log(`[DEV] WhatsApp OTP to ${phone}: code=${code}`);
    }
    const result = await this.provider.sendOtpTemplate(phone, code);
    if (!result.ok) {
      this.logger.warn(
        `WhatsApp OTP delivery failed for ${phone}: ${result.error ?? 'unknown'}`,
      );
    }
    return result.ok;
  }
}
