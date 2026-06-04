import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { EmailService } from '../email/email.service';
import { NotificationPrefsService } from '../users/notification-prefs.service';
import { PostHogService } from '../analytics/posthog.service';
import {
  NotificationBroadcastStatus,
  Prisma,
  UserRole,
  UserStatus,
} from '@prisma/client';
import {
  CreateBroadcastDto,
  BroadcastChannelsDto,
} from './dto/create-broadcast.dto';
import { BroadcastQueryDto } from './dto/broadcast-query.dto';

/**
 * Resolved per-broadcast channel toggles. Each flag controls whether one of
 * the two fan-out paths fires for a given broadcast.
 *
 * The `sms` channel was removed 2026-05-26 (PR C2 of the Orange/AT/Flexpay
 * removal initiative). Legacy stored values with `sms: true` are silently
 * dropped at read time — no SMS delivery happens regardless.
 */
export interface BroadcastChannels {
  push: boolean;
  email: boolean;
}

/**
 * Default channels when a broadcast row has `channels = NULL` (legacy rows
 * + new broadcasts that don't pass a `channels` payload).
 */
export const BROADCAST_DEFAULT_CHANNELS: BroadcastChannels = {
  push: true,
  email: true,
};

@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(
    private prisma: PrismaService,
    private pushService: PushService,
    private emailService: EmailService,
    private notificationPrefs: NotificationPrefsService,
    private analytics: PostHogService,
  ) {}

  /**
   * Admin: paginated list of broadcasts.
   */
  async findAll(query: BroadcastQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [broadcasts, total] = await Promise.all([
      this.prisma.notificationBroadcast.findMany({
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notificationBroadcast.count(),
    ]);

    return {
      data: broadcasts,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Admin: single broadcast detail.
   */
  async findOne(id: string) {
    const broadcast = await this.prisma.notificationBroadcast.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!broadcast) {
      throw new NotFoundException('Diffusion non trouvée');
    }

    return broadcast;
  }

  /**
   * Admin: create a broadcast with status=DRAFT.
   */
  async create(dto: CreateBroadcastDto, userId: string) {
    const broadcast = await this.prisma.notificationBroadcast.create({
      data: {
        title: dto.title,
        message: dto.message,
        segment: dto.segment,
        status: NotificationBroadcastStatus.DRAFT,
        createdById: userId,
        channels: dto.channels
          ? (this.normalizeChannelsInput(dto.channels) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    this.logger.log(
      `Broadcast ${broadcast.id} created by admin ${userId} (segment: ${dto.segment})`,
    );

    return broadcast;
  }

  /**
   * Admin: send a broadcast.
   * Sets status to SENDING, queries recipients by segment,
   * then fans out across push/email asynchronously without
   * blocking the response.
   */
  async send(id: string) {
    const broadcast = await this.prisma.notificationBroadcast.findUnique({
      where: { id },
    });

    if (!broadcast) {
      throw new NotFoundException('Diffusion non trouvée');
    }

    if (broadcast.status !== NotificationBroadcastStatus.DRAFT) {
      throw new BadRequestException(
        `Impossible d'envoyer une diffusion au statut ${broadcast.status}. Seules les diffusions au statut DRAFT peuvent être envoyées.`,
      );
    }

    // Determine role filter based on segment
    const roleFilter = this.getSegmentRoleFilter(broadcast.segment);

    // Count recipients (all active users in segment — per-channel + per-user
    // opt-out filtering happens at fan-out time)
    const recipientCount = await this.prisma.user.count({
      where: {
        ...roleFilter,
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
    });

    if (recipientCount === 0) {
      throw new BadRequestException(
        'Aucun destinataire trouvé pour ce segment',
      );
    }

    // Update to SENDING with recipient count
    const updated = await this.prisma.notificationBroadcast.update({
      where: { id },
      data: {
        status: NotificationBroadcastStatus.SENDING,
        recipientCount,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    const channels = this.resolveChannels(broadcast.channels);

    // Server-owned admin event, attributed to the admin who sent it.
    this.analytics.capture(broadcast.createdById, 'broadcast_sent', {
      broadcastId: id,
      segment: broadcast.segment,
      recipient_count: recipientCount,
      channels,
    });

    // Fan out asynchronously (don't block the response)
    setImmediate(() => {
      this.processBroadcastSending(
        id,
        broadcast.title,
        broadcast.message,
        roleFilter,
        channels,
      ).catch((err) => {
        this.logger.error(
          `Error processing broadcast ${id}`,
          err instanceof Error ? err.message : err,
        );
      });
    });

    this.logger.log(
      `Broadcast ${id} sending started (${recipientCount} recipients, channels=${JSON.stringify(channels)})`,
    );

    return updated;
  }

  /**
   * Admin: delete a broadcast (only if DRAFT).
   */
  async remove(id: string) {
    const broadcast = await this.prisma.notificationBroadcast.findUnique({
      where: { id },
    });

    if (!broadcast) {
      throw new NotFoundException('Diffusion non trouvée');
    }

    if (broadcast.status !== NotificationBroadcastStatus.DRAFT) {
      throw new BadRequestException(
        `Impossible de supprimer une diffusion au statut ${broadcast.status}. Seules les diffusions au statut DRAFT peuvent être supprimées.`,
      );
    }

    await this.prisma.notificationBroadcast.delete({
      where: { id },
    });

    this.logger.log(`Broadcast ${id} deleted`);

    return { deleted: true };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  /**
   * Returns a Prisma where clause for the user role based on segment.
   */
  private getSegmentRoleFilter(segment: string): { role?: UserRole } {
    switch (segment) {
      case 'ALL_BUYERS':
        return { role: UserRole.BUYER };
      case 'ALL_SELLERS':
        return { role: UserRole.SELLER };
      case 'ALL_USERS':
      default:
        return {};
    }
  }

  /**
   * Coerces the stored channels JSON into a strict {push,email}. NULL or
   * malformed input falls back to BROADCAST_DEFAULT_CHANNELS. Legacy
   * `sms: true` values from rows created before C2 are silently dropped.
   */
  private resolveChannels(stored: Prisma.JsonValue | null): BroadcastChannels {
    if (stored == null || typeof stored !== 'object' || Array.isArray(stored)) {
      return { ...BROADCAST_DEFAULT_CHANNELS };
    }
    const obj = stored;
    return {
      push:
        typeof obj.push === 'boolean'
          ? obj.push
          : BROADCAST_DEFAULT_CHANNELS.push,
      email:
        typeof obj.email === 'boolean'
          ? obj.email
          : BROADCAST_DEFAULT_CHANNELS.email,
    };
  }

  /**
   * Strips unknown keys (including the legacy `sms` key) from the incoming
   * DTO before persisting. We don't pre-fill defaults here —
   * `resolveChannels()` does that at read time so the stored JSON stays a
   * faithful record of what the admin actually picked.
   */
  private normalizeChannelsInput(
    input: BroadcastChannelsDto,
  ): Prisma.JsonObject {
    const out: Prisma.JsonObject = {};
    if (typeof input.push === 'boolean') out.push = input.push;
    if (typeof input.email === 'boolean') out.email = input.email;
    return out;
  }

  /**
   * Asynchronously fans out a broadcast to all recipients matching the role
   * filter across the enabled channels. Per-user accounting: a user counts
   * as `sent` if at least one of their enabled+opted-in+capable channels
   * delivered successfully; `failed` if all attempted channels failed; and
   * is skipped (no count) if zero channels were attempted (no opt-ins or
   * no contact info).
   */
  private async processBroadcastSending(
    broadcastId: string,
    title: string,
    message: string,
    roleFilter: { role?: UserRole },
    channels: BroadcastChannels,
  ) {
    let sentCount = 0;
    let failedCount = 0;

    try {
      const batchSize = 100;
      let skip = 0;
      let hasMore = true;

      while (hasMore) {
        const users = await this.prisma.user.findMany({
          where: {
            ...roleFilter,
            deletedAt: null,
            status: UserStatus.ACTIVE,
          },
          select: { id: true, email: true },
          skip,
          take: batchSize,
        });

        if (users.length === 0) {
          hasMore = false;
          break;
        }

        for (const user of users) {
          let attempted = false;
          let anySucceeded = false;

          // Push (FCM) — primary channel for users with the mobile app
          if (
            channels.push &&
            (await this.notificationPrefs.shouldSendPushBroadcasts(user.id))
          ) {
            attempted = true;
            try {
              const result = await this.pushService.sendToUser(user.id, {
                title,
                body: message,
                data: { broadcastId, kind: 'broadcast' },
              });
              if (result.succeeded > 0) anySucceeded = true;
            } catch (err) {
              this.logger.warn(
                `Push failed for user ${user.id} on broadcast ${broadcastId}: ${
                  err instanceof Error ? err.message : err
                }`,
              );
            }
          }

          // Email (Resend) — for any user with an email on file
          if (
            channels.email &&
            user.email &&
            (await this.notificationPrefs.shouldSendEmailBroadcasts(user.id))
          ) {
            attempted = true;
            try {
              const ok = await this.emailService.sendBroadcast(user.email, {
                title,
                message,
              });
              if (ok) anySucceeded = true;
            } catch (err) {
              this.logger.warn(
                `Email failed for user ${user.id} on broadcast ${broadcastId}: ${
                  err instanceof Error ? err.message : err
                }`,
              );
            }
          }

          if (attempted) {
            if (anySucceeded) sentCount++;
            else failedCount++;
            // Small throttle so we don't saturate FCM / Resend in one
            // tight loop. 100ms = 10/s = well within both providers'
            // documented rate limits for batched sends.
            await this.delay(100);
          }
          // else: user has no enabled+capable channel — skip silently.
        }

        skip += batchSize;
        if (users.length < batchSize) {
          hasMore = false;
        }

        // Update counts periodically
        await this.prisma.notificationBroadcast.update({
          where: { id: broadcastId },
          data: { sentCount, failedCount },
        });
      }

      // Final update: mark as SENT
      await this.prisma.notificationBroadcast.update({
        where: { id: broadcastId },
        data: {
          status: NotificationBroadcastStatus.SENT,
          sentCount,
          failedCount,
          sentAt: new Date(),
        },
      });

      this.logger.log(
        `Broadcast ${broadcastId} completed: ${sentCount} sent, ${failedCount} failed`,
      );
    } catch (error) {
      // Mark as FAILED if the process itself fails
      await this.prisma.notificationBroadcast.update({
        where: { id: broadcastId },
        data: {
          status: NotificationBroadcastStatus.FAILED,
          sentCount,
          failedCount,
        },
      });

      this.logger.error(
        `Broadcast ${broadcastId} failed`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Promise-based delay utility.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
