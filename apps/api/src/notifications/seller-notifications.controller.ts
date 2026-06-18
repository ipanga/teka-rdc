import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { UserNotificationService } from './user-notification.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * The authenticated seller's own in-app notification feed. Every method is
 * scoped to `userId` from the JWT (via @CurrentUser) — a seller can only ever
 * read / mark their OWN notifications. Protected by the global JwtAuthGuard.
 */
@Controller('v1/seller/notifications')
export class SellerNotificationsController {
  constructor(private notifications: UserNotificationService) {}

  @Get()
  list(
    @CurrentUser('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(userId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('unread-count')
  unreadCount(@CurrentUser('userId') userId: string) {
    return this.notifications.unreadCount(userId);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser('userId') userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(userId, id);
  }
}
