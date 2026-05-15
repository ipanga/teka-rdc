import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WhatsappService } from './whatsapp.service';
import { WHATSAPP_PROVIDER } from './interfaces/whatsapp-provider.interface';
import { GupshupWhatsappProvider } from './providers/gupshup-whatsapp.provider';
import { MockWhatsappProvider } from './providers/mock-whatsapp.provider';

const whatsappProviderFactory = {
  provide: WHATSAPP_PROVIDER,
  useFactory: (configService: ConfigService) => {
    const provider = configService
      .get<string>('WHATSAPP_PROVIDER', 'mock')
      .toLowerCase();
    const isProd = configService.get<string>('NODE_ENV') === 'production';
    const logger = new Logger('WhatsappProviderFactory');

    // Loud guard mirroring SMS factory: a mock provider in production
    // silently swallows every buyer OTP. Surface at startup so it's caught
    // before users hit "no WhatsApp code arrived" tickets.
    const warnIfMockInProd = (reason: string) => {
      if (!isProd) return;
      logger.error(
        `⚠️  ${reason} — NO REAL WHATSAPP OTP WILL BE SENT IN PRODUCTION. ` +
          'Set WHATSAPP_PROVIDER=gupshup in .env.production and recreate the api container.',
      );
    };

    switch (provider) {
      case 'gupshup':
        logger.log('Using Gupshup WhatsApp provider');
        return new GupshupWhatsappProvider(configService);
      case 'mock':
        warnIfMockInProd('WHATSAPP_PROVIDER=mock');
        if (!isProd) logger.log('Using Mock WhatsApp provider');
        return new MockWhatsappProvider();
      default:
        warnIfMockInProd(`Unknown WHATSAPP_PROVIDER="${provider}"`);
        if (!isProd) {
          logger.warn(
            `Unknown WHATSAPP_PROVIDER="${provider}", defaulting to mock`,
          );
        }
        return new MockWhatsappProvider();
    }
  },
  inject: [ConfigService],
};

@Module({
  imports: [ConfigModule],
  providers: [WhatsappService, whatsappProviderFactory],
  exports: [WhatsappService],
})
export class WhatsappModule {}
