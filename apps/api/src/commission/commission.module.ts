import { Module } from '@nestjs/common';
import { CommissionService } from './commission.service';
import { CommissionController } from './commission.controller';
import { SellerCommissionController } from './seller-commission.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CommissionController, SellerCommissionController],
  providers: [CommissionService],
  exports: [CommissionService],
})
export class CommissionModule {}
