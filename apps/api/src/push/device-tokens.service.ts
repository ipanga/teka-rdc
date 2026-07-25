import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

@Injectable()
export class DeviceTokensService {
  private readonly logger = new Logger(DeviceTokensService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Upsert by (userId, token). If a token re-registers under the
   * same user — common path: app restart — we just bump `lastSeenAt`
   * and reactivate. If a token *moves* between users (shared device),
   * we reassign rather than duplicate. The `token` column is globally
   * unique, so the prior row's userId is overwritten in that case.
   *
   * Soft-deletion semantics: we deliberately don't hard-delete on
   * logout — see DeviceTokensController.unregister().
   */
  async register(
    userId: string,
    dto: RegisterDeviceTokenDto,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.deviceToken.findUnique({
      where: { token: dto.token },
      select: { id: true, userId: true },
    });

    if (existing) {
      const row = await this.prisma.deviceToken.update({
        where: { id: existing.id },
        data: {
          userId,
          platform: dto.platform,
          deviceInfo: dto.deviceInfo ?? null,
          appVersion: dto.appVersion ?? null,
          isActive: true,
          lastSeenAt: new Date(),
        },
        select: { id: true },
      });
      if (existing.userId !== userId) {
        this.logger.log(
          `device token reassigned from user ${existing.userId} to ${userId}`,
        );
      }
      return row;
    }

    const row = await this.prisma.deviceToken.create({
      data: {
        userId,
        token: dto.token,
        platform: dto.platform,
        deviceInfo: dto.deviceInfo ?? null,
        appVersion: dto.appVersion ?? null,
      },
      select: { id: true },
    });
    return row;
  }

  /**
   * Mark `isActive=false` for the supplied token if it belongs to the
   * given user. Returns true if a row was updated (1 affected), false
   * if there was nothing matching (already removed, never registered,
   * cross-account attempt). We do NOT 404 on cross-account — same
   * neutral-response philosophy as password-reset to avoid leaking
   * whether a given token exists.
   *
   * Keeping the row (vs hard-delete) preserves the audit trail and
   * means a re-register can flip the same row back to active without
   * a fresh INSERT.
   */
  async unregister(
    userId: string,
    token: string,
  ): Promise<{ removed: number }> {
    const result = await this.prisma.deviceToken.updateMany({
      where: { userId, token, isActive: true },
      data: { isActive: false },
    });
    return { removed: result.count };
  }

  /**
   * Deactivates ALL of a user's push tokens — used on account deletion so no
   * further push can be delivered to a removed account. Soft (isActive=false),
   * keeping the audit rows.
   */
  async deactivateAll(userId: string): Promise<{ removed: number }> {
    const result = await this.prisma.deviceToken.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    return { removed: result.count };
  }
}
