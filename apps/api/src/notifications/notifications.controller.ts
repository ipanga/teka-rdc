import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { UserNotificationService } from './user-notification.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * The authenticated user's own in-app notification feed (any role — buyers use
 * this; the seller app keeps its own /v1/seller/notifications alias). Every
 * method is scoped to `userId` from the JWT (via @CurrentUser), so a user can
 * only ever read / mark their OWN notifications. Protected by the global
 * JwtAuthGuard. Backs the buyer-web bell + /notifications page and the
 * buyer-mobile Notification Center.
 */
@Controller('v1/notifications')
export class NotificationsController {
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
  markRead(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.notifications.markRead(userId, id);
  }
}
