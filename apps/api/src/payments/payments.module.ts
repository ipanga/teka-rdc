import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { EarningsService } from './earnings.service';

// COD-only since 2026-05-26 (PR B2 of the Orange/AT/Flexpay removal
// initiative). No payment provider / factory / webhook — order transactions
// are written directly as TransactionProvider.COD with status PENDING, then
// marked COMPLETED by SellerOrdersService when the order is delivered.
@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, EarningsService],
  exports: [PaymentsService, EarningsService],
})
export class PaymentsModule {}
