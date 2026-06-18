import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AdminNotificationService } from '../notifications/admin-notification.service';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/notifications')
@Roles('ADMIN')
export class AdminNotificationsController {
  constructor(private adminNotifications: AdminNotificationService) {}

  @Get()
  list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminNotifications.list({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('unread-count')
  unreadCount() {
    return this.adminNotifications.unreadCount();
  }

  @Patch('read-all')
  markAllRead() {
    return this.adminNotifications.markAllRead();
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.adminNotifications.markRead(id);
  }
}
