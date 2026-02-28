import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { EarningsService } from './earnings.service';
import { FlexpayProvider } from './providers/flexpay.provider';
import { MockPaymentProvider } from './providers/mock-payment.provider';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    EarningsService,
    {
      provide: 'PAYMENT_PROVIDER',
      useFactory: (configService: ConfigService) => {
        const mockMode = configService.get<string>('PAYMENT_MOCK_MODE', 'true');
        if (mockMode === 'true' || mockMode === '1') {
          return new MockPaymentProvider();
        }
        return new FlexpayProvider(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: [PaymentsService, EarningsService],
})
export class PaymentsModule {}
