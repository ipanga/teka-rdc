import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { PushModule } from '../push/push.module';
import { OrderNotificationService } from './order-notification.service';
import { SellerNotificationService } from './seller-notification.service';

@Module({
  imports: [PrismaModule, UsersModule, PushModule],
  providers: [OrderNotificationService, SellerNotificationService],
  exports: [OrderNotificationService, SellerNotificationService],
})
export class NotificationsModule {}
