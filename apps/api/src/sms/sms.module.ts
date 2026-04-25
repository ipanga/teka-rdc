import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { SMS_PROVIDER } from './interfaces/sms-provider.interface';
import { AfricasTalkingSmsProvider } from './providers/africas-talking.provider';
import { OrangeDrcSmsProvider } from './providers/orange-drc.provider';
import { MockSmsProvider } from './providers/mock-sms.provider';

const smsProviderFactory = {
  provide: SMS_PROVIDER,
  useFactory: (configService: ConfigService) => {
    const provider = configService
      .get<string>('SMS_PROVIDER', 'orange')
      .toLowerCase();
    const isProd = configService.get<string>('NODE_ENV') === 'production';
    const logger = new Logger('SmsProviderFactory');

    // Loud guard: if a fake provider is chosen in production the platform
    // silently swallows every OTP. Surface this at startup so it's caught
    // before users hit "no SMS arrived" tickets.
    const warnIfMockInProd = (reason: string) => {
      if (!isProd) return;
      logger.error(
        `⚠️  ${reason} — NO REAL SMS WILL BE SENT IN PRODUCTION. ` +
          'Set SMS_PROVIDER=orange in .env.production and recreate the api container.',
      );
    };

    switch (provider) {
      case 'orange':
        logger.log('Using Orange DRC SMS provider');
        return new OrangeDrcSmsProvider(configService);
      case 'africas_talking':
      case 'at':
        logger.log("Using Africa's Talking SMS provider");
        return new AfricasTalkingSmsProvider(configService);
      case 'mock':
        warnIfMockInProd('SMS_PROVIDER=mock');
        if (!isProd) logger.log('Using Mock SMS provider');
        return new MockSmsProvider();
      default:
        warnIfMockInProd(`Unknown SMS_PROVIDER="${provider}"`);
        if (!isProd) {
          logger.warn(`Unknown SMS_PROVIDER="${provider}", defaulting to mock`);
        }
        return new MockSmsProvider();
    }
  },
  inject: [ConfigService],
};

@Module({
  imports: [ConfigModule],
  providers: [SmsService, smsProviderFactory],
  exports: [SmsService],
})
export class SmsModule {}
