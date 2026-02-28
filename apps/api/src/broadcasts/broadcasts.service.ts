import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import {
  NotificationBroadcastStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { BroadcastQueryDto } from './dto/broadcast-query.dto';

@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
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
   * then sends SMS asynchronously without blocking the response.
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

    // Count recipients
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

    // Send SMS asynchronously (don't block the response)
    setImmediate(() => {
      this.processBroadcastSending(id, broadcast.message, roleFilter).catch(
        (err) => {
          this.logger.error(
            `Error processing broadcast ${id}`,
            err instanceof Error ? err.message : err,
          );
        },
      );
    });

    this.logger.log(
      `Broadcast ${id} sending started (${recipientCount} recipients)`,
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
   * Asynchronously sends SMS to all recipients matching the role filter.
   * Increments sentCount or failedCount, with 100ms delay between sends.
   * Updates broadcast status to SENT when done.
   */
  private async processBroadcastSending(
    broadcastId: string,
    message: string,
    roleFilter: { role?: UserRole },
  ) {
    let sentCount = 0;
    let failedCount = 0;

    try {
      // Fetch all recipients in batches of 100
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
          select: { id: true, phone: true },
          skip,
          take: batchSize,
        });

        if (users.length === 0) {
          hasMore = false;
          break;
        }

        for (const user of users) {
          try {
            const success = await this.smsService.sendSms(user.phone, message);
            if (success) {
              sentCount++;
            } else {
              failedCount++;
            }
          } catch {
            failedCount++;
            this.logger.warn(
              `Failed to send SMS to ${user.phone} for broadcast ${broadcastId}`,
            );
          }

          // 100ms delay between sends to avoid flooding
          await this.delay(100);
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
