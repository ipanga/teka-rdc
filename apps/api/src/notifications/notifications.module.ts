import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrderNotificationService } from './order-notification.service';

@Module({
  imports: [PrismaModule],
  providers: [OrderNotificationService],
  exports: [OrderNotificationService],
})
export class NotificationsModule {}
