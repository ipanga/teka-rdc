import { Injectable, Logger } from '@nestjs/common';
import { AdminNotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * In-app admin notification feed (the platform moderation inbox). Writes are
 * fire-and-forget — `create()` never throws, so emitting a notification can't
 * block the originating flow (e.g. a seller submitting a product). Reads back
 * the dashboard bell + unread badge.
 *
 * Push/email are intentionally NOT wired here: this is an in-dashboard feed,
 * not a device notification. Keep it that way unless admins ask for push.
 */
@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  constructor(private prisma: PrismaService) {}

  async create(input: {
    type: AdminNotificationType;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
  }): Promise<void> {
    try {
      await this.prisma.adminNotification.create({
        data: {
          type: input.type,
          title: input.title,
          body: input.body,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
        },
      });
    } catch (error: any) {
      // Never let a notification write break the caller's flow.
      this.logger.error(
        `Échec de création de notification admin (${input.type}): ${error?.message ?? error}`,
        error?.stack,
      );
    }
  }

  async list(params: { page?: number; limit?: number } = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.adminNotification.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.adminNotification.count(),
      this.prisma.adminNotification.count({ where: { readAt: null } }),
    ]);

    return {
      success: true as const,
      data: items,
      meta: { page, limit, total, unread },
    };
  }

  async unreadCount(): Promise<{ success: true; data: { unread: number } }> {
    const unread = await this.prisma.adminNotification.count({
      where: { readAt: null },
    });
    return { success: true, data: { unread } };
  }

  async markRead(id: string): Promise<{ success: true; data: { id: string } }> {
    // updateMany (not update) so a missing/already-read id is a no-op 200
    // rather than a P2025 throw.
    await this.prisma.adminNotification.updateMany({
      where: { id, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, data: { id } };
  }

  async markAllRead(): Promise<{ success: true; data: { count: number } }> {
    const res = await this.prisma.adminNotification.updateMany({
      where: { readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, data: { count: res.count } };
  }
}
