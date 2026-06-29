import { Module } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { AdminReturnsController } from './admin-returns.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, PaymentsModule, NotificationsModule],
  controllers: [AdminReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
