import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { OrderNotificationService } from './order-notification.service';

@Module({
  imports: [PrismaModule, UsersModule],
  providers: [OrderNotificationService],
  exports: [OrderNotificationService],
})
export class NotificationsModule {}
