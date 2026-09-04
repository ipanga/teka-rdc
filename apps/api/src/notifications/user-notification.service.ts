import { Injectable, Logger } from '@nestjs/common';
import { UserNotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Per-user in-app notification feed. EVERY read/write is scoped to a `userId`
 * — there is no endpoint or method that returns another user's notifications,
 * and mark-read uses a `{ id, userId }` filter so a user can only touch their
 * own rows (no cross-account leak / IDOR). Writes are fire-and-forget:
 * `create()` never throws so emitting a notification can't break the caller
 * (e.g. an admin approving a product).
 */
@Injectable()
export class UserNotificationService {
  private readonly logger = new Logger(UserNotificationService.name);

  constructor(private prisma: PrismaService) {}

  async create(input: {
    userId: string;
    type: UserNotificationType;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
  }): Promise<void> {
    try {
      await this.prisma.userNotification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Échec de création de notification utilisateur (${input.type}, user ${input.userId}): ${error?.message ?? error}`,
        error?.stack,
      );
    }
  }

  /**
   * Like `create`, but skips when an identical row (same user, type, entity
   * and title) already exists — a cheap effectively-once guard for events
   * that can be re-emitted (e.g. a payout transition retried after a partial
   * failure). Never throws. Returns whether a row was written.
   */
  async createIfAbsent(input: {
    userId: string;
    type: UserNotificationType;
    title: string;
    body: string;
    entityType: string;
    entityId: string;
  }): Promise<boolean> {
    try {
      const existing = await this.prisma.userNotification.findFirst({
        where: {
          userId: input.userId,
          type: input.type,
          entityType: input.entityType,
          entityId: input.entityId,
          title: input.title,
        },
        select: { id: true },
      });
      if (existing) return false;
      await this.prisma.userNotification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          entityType: input.entityType,
          entityId: input.entityId,
        },
      });
      return true;
    } catch (error: any) {
      this.logger.error(
        `Échec de création (dédupliquée) de notification utilisateur (${input.type}, user ${input.userId}): ${error?.message ?? error}`,
        error?.stack,
      );
      return false;
    }
  }

  async list(userId: string, params: { page?: number; limit?: number } = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.userNotification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.userNotification.count({ where: { userId } }),
      this.prisma.userNotification.count({ where: { userId, readAt: null } }),
    ]);

    return {
      success: true as const,
      data: items,
      meta: { page, limit, total, unread },
    };
  }

  async unreadCount(
    userId: string,
  ): Promise<{ success: true; data: { unread: number } }> {
    const unread = await this.prisma.userNotification.count({
      where: { userId, readAt: null },
    });
    return { success: true, data: { unread } };
  }

  async markRead(
    userId: string,
    id: string,
  ): Promise<{ success: true; data: { id: string } }> {
    // Ownership-scoped: the `userId` in the WHERE means a user can never mark
    // another user's notification. updateMany (not update) → a missing/foreign
    // id is a no-op 200, never a P2025 throw or a 404 that leaks existence.
    await this.prisma.userNotification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, data: { id } };
  }

  async markAllRead(
    userId: string,
  ): Promise<{ success: true; data: { count: number } }> {
    const res = await this.prisma.userNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, data: { count: res.count } };
  }
}
