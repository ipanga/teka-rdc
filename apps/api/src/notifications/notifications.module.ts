import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { PushModule } from '../push/push.module';
import { EmailModule } from '../email/email.module';
import { OrderNotificationService } from './order-notification.service';
import { SellerNotificationService } from './seller-notification.service';
import { AdminNotificationService } from './admin-notification.service';
import { UserNotificationService } from './user-notification.service';
import { SellerNotificationsController } from './seller-notifications.controller';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [PrismaModule, UsersModule, PushModule, EmailModule],
  controllers: [SellerNotificationsController, NotificationsController],
  providers: [
    OrderNotificationService,
    SellerNotificationService,
    AdminNotificationService,
    UserNotificationService,
  ],
  exports: [
    OrderNotificationService,
    SellerNotificationService,
    AdminNotificationService,
    UserNotificationService,
  ],
})
export class NotificationsModule {}
