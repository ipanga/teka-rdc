import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationPrefsDto,
  ResolvedNotificationPrefs,
  DEFAULT_NOTIFICATION_PREFS,
} from './dto/notification-prefs.dto';

/**
 * Reads + writes per-user notification opt-outs and exposes lightweight
 * `shouldSend*` predicates for the notification call sites.
 *
 * `User.notificationPrefs` is a nullable JSONB column. NULL means "all on";
 * partial objects fall back to DEFAULT_NOTIFICATION_PREFS for missing keys.
 *
 * Transactional sends (OTP, password reset, email verify) bypass this
 * service entirely — they are not opt-out-able.
 */
@Injectable()
export class NotificationPrefsService {
  private readonly logger = new Logger(NotificationPrefsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Read + resolve the user's prefs with defaults applied. Returns the
   * default ALL-ON set when the user doesn't exist or has no stored prefs.
   */
  async resolve(userId: string): Promise<ResolvedNotificationPrefs> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { notificationPrefs: true },
    });
    if (!user || user.notificationPrefs == null) {
      return { ...DEFAULT_NOTIFICATION_PREFS };
    }
    const stored = user.notificationPrefs as Prisma.JsonObject;
    return {
      smsOrderUpdates:
        typeof stored.smsOrderUpdates === 'boolean'
          ? stored.smsOrderUpdates
          : DEFAULT_NOTIFICATION_PREFS.smsOrderUpdates,
      smsBroadcasts:
        typeof stored.smsBroadcasts === 'boolean'
          ? stored.smsBroadcasts
          : DEFAULT_NOTIFICATION_PREFS.smsBroadcasts,
      pushBroadcasts:
        typeof stored.pushBroadcasts === 'boolean'
          ? stored.pushBroadcasts
          : DEFAULT_NOTIFICATION_PREFS.pushBroadcasts,
      emailBroadcasts:
        typeof stored.emailBroadcasts === 'boolean'
          ? stored.emailBroadcasts
          : DEFAULT_NOTIFICATION_PREFS.emailBroadcasts,
    };
  }

  /**
   * Merge the partial DTO into the existing stored prefs (preserves any
   * keys the DTO doesn't touch). Returns the new resolved set.
   */
  async update(
    userId: string,
    dto: NotificationPrefsDto,
  ): Promise<ResolvedNotificationPrefs> {
    const current = await this.resolve(userId);
    const next: ResolvedNotificationPrefs = {
      smsOrderUpdates:
        dto.smsOrderUpdates !== undefined
          ? dto.smsOrderUpdates
          : current.smsOrderUpdates,
      smsBroadcasts:
        dto.smsBroadcasts !== undefined
          ? dto.smsBroadcasts
          : current.smsBroadcasts,
      pushBroadcasts:
        dto.pushBroadcasts !== undefined
          ? dto.pushBroadcasts
          : current.pushBroadcasts,
      emailBroadcasts:
        dto.emailBroadcasts !== undefined
          ? dto.emailBroadcasts
          : current.emailBroadcasts,
    };
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        // `next` is a flat object of booleans — safe to cast to
        // InputJsonValue. `Prisma.JsonValue` is the wrong type here because
        // it includes `null`, which Prisma rejects on a non-nullable
        // JsonValue assignment.
        notificationPrefs: next as unknown as Prisma.InputJsonValue,
      },
    });
    return next;
  }

  /**
   * Fast predicate for the SMS notifications service. Tolerates lookup
   * failures (logs + returns true) so a bad row doesn't silently drop
   * notifications.
   */
  async shouldSendOrderUpdates(userId: string | null): Promise<boolean> {
    if (!userId) return true;
    try {
      const prefs = await this.resolve(userId);
      return prefs.smsOrderUpdates;
    } catch (e) {
      this.logger.warn(
        `shouldSendOrderUpdates(${userId}) lookup failed, defaulting to true: ${e}`,
      );
      return true;
    }
  }

  async shouldSendBroadcasts(userId: string | null): Promise<boolean> {
    if (!userId) return true;
    try {
      const prefs = await this.resolve(userId);
      return prefs.smsBroadcasts;
    } catch (e) {
      this.logger.warn(
        `shouldSendBroadcasts(${userId}) lookup failed, defaulting to true: ${e}`,
      );
      return true;
    }
  }

  async shouldSendPushBroadcasts(userId: string | null): Promise<boolean> {
    if (!userId) return true;
    try {
      const prefs = await this.resolve(userId);
      return prefs.pushBroadcasts;
    } catch (e) {
      this.logger.warn(
        `shouldSendPushBroadcasts(${userId}) lookup failed, defaulting to true: ${e}`,
      );
      return true;
    }
  }

  async shouldSendEmailBroadcasts(userId: string | null): Promise<boolean> {
    if (!userId) return true;
    try {
      const prefs = await this.resolve(userId);
      return prefs.emailBroadcasts;
    } catch (e) {
      this.logger.warn(
        `shouldSendEmailBroadcasts(${userId}) lookup failed, defaulting to true: ${e}`,
      );
      return true;
    }
  }
}
