import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReturnsModule } from '../returns/returns.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { SellerOrdersService } from './seller-orders.service';
import { SellerOrdersController } from './seller-orders.controller';

@Module({
  imports: [PrismaModule, NotificationsModule, PaymentsModule, ReturnsModule],
  controllers: [OrdersController, SellerOrdersController],
  providers: [OrdersService, SellerOrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
