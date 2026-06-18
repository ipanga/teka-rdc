import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { PushModule } from '../push/push.module';
import { EmailModule } from '../email/email.module';
import { OrderNotificationService } from './order-notification.service';
import { SellerNotificationService } from './seller-notification.service';
import { AdminNotificationService } from './admin-notification.service';

@Module({
  imports: [PrismaModule, UsersModule, PushModule, EmailModule],
  providers: [
    OrderNotificationService,
    SellerNotificationService,
    AdminNotificationService,
  ],
  exports: [
    OrderNotificationService,
    SellerNotificationService,
    AdminNotificationService,
  ],
})
export class NotificationsModule {}
