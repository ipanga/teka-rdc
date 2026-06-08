import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PayoutsService } from './payouts.service';
import {
  SellerPayoutsController,
  AdminPayoutsController,
} from './payouts.controller';

@Module({
  imports: [PaymentsModule, NotificationsModule],
  controllers: [SellerPayoutsController, AdminPayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
