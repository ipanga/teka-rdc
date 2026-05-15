import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SMS_PROVIDER } from './interfaces/sms-provider.interface';
import type { SmsProvider } from './interfaces/sms-provider.interface';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly isDev: boolean;

  constructor(
    private configService: ConfigService,
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
  ) {
    this.isDev = this.configService.get<string>('NODE_ENV') === 'development';
    this.logger.log(`SMS provider active: ${this.provider.name}`);
  }

  async sendSms(phone: string, message: string): Promise<boolean> {
    return this.dispatch(phone, message);
  }

  private async dispatch(phone: string, message: string): Promise<boolean> {
    if (this.isDev && this.provider.name !== 'mock') {
      this.logger.log(
        `[DEV] SMS to ${phone} via ${this.provider.name}: ${message}`,
      );
      return true;
    }
    const result = await this.provider.sendSms(phone, message);
    if (!result.ok) {
      this.logger.warn(
        `SMS delivery failed for ${phone}: ${result.error ?? 'unknown'}`,
      );
    }
    return result.ok;
  }
}
