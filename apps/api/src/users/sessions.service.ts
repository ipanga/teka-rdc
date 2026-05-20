import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SessionDto {
  id: string;
  createdAt: string;
  ipAddress: string | null;
  deviceInfo: string | null;
  current: boolean;
}

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * List the user's currently-active refresh tokens. The row whose id
   * matches `currentJti` (the jti on the access token making this call)
   * is marked `current: true` so the UI can disable the revoke button
   * on it and label it accordingly.
   *
   * "Active" = not revoked AND not expired. Expired rows are pruned
   * lazily by the issue path; we just filter them here so they never
   * surface in the UI.
   */
  async list(userId: string, currentJti: string): Promise<SessionDto[]> {
    const rows = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        ipAddress: true,
        deviceInfo: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      ipAddress: r.ipAddress,
      deviceInfo: r.deviceInfo,
      current: r.id === currentJti,
    }));
  }

  /**
   * Revoke a single non-current session. Refuses self-revocation —
   * use POST /v1/auth/logout for that flow so cookies are cleared
   * atomically. 404 (not 403) when the jti belongs to another user
   * to avoid leaking session-id existence cross-account.
   */
  async revoke(userId: string, jti: string, currentJti: string) {
    if (jti === currentJti) {
      throw new BadRequestException(
        'Impossible de révoquer la session actuelle. Utilisez la déconnexion.',
      );
    }

    const row = await this.prisma.refreshToken.findUnique({
      where: { id: jti },
      select: { userId: true, revokedAt: true },
    });

    if (!row || row.userId !== userId) {
      throw new NotFoundException('Session introuvable');
    }
    if (row.revokedAt) {
      return { revoked: 0 };
    }

    await this.prisma.refreshToken.update({
      where: { id: jti },
      data: { revokedAt: new Date() },
    });
    return { revoked: 1 };
  }

  /**
   * Revoke every active session except the one making the call.
   * Returns the count of rows revoked. Idempotent — already-revoked
   * rows are skipped by the `revokedAt: null` filter.
   */
  async revokeAllExceptCurrent(userId: string, currentJti: string) {
    const result = await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        id: { not: currentJti },
      },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count };
  }
}
