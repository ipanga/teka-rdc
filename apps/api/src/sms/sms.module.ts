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
    const provider = configService.get<string>('SMS_PROVIDER', 'orange').toLowerCase();
    const logger = new Logger('SmsProviderFactory');
    switch (provider) {
      case 'orange':
        logger.log('Using Orange DRC SMS provider');
        return new OrangeDrcSmsProvider(configService);
      case 'africas_talking':
      case 'at':
        logger.log('Using Africa\'s Talking SMS provider');
        return new AfricasTalkingSmsProvider(configService);
      case 'mock':
        logger.log('Using Mock SMS provider');
        return new MockSmsProvider();
      default:
        logger.warn(`Unknown SMS_PROVIDER="${provider}", defaulting to mock`);
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
