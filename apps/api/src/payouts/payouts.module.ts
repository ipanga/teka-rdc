import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PayoutsService } from './payouts.service';
import {
  SellerPayoutsController,
  AdminPayoutsController,
} from './payouts.controller';

@Module({
  imports: [PaymentsModule],
  controllers: [SellerPayoutsController, AdminPayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
