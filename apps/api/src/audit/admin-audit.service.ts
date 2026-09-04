import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Actions recorded in `admin_audit_logs`. Keep them stable — reports filter on them. */
export type AdminAuditAction =
  | 'PAYOUT_APPROVED'
  | 'PAYOUT_PROCESSING'
  | 'PAYOUT_COMPLETED'
  | 'PAYOUT_REJECTED'
  | 'COMMISSION_SETTING_UPSERTED'
  | 'COMMISSION_SETTING_REMOVED'
  | 'SELLER_COMMISSION_OVERRIDE_SET'
  | 'SELLER_COMMISSION_OVERRIDE_CLEARED';

export interface AdminAuditEntry {
  actorId: string;
  action: AdminAuditAction;
  entityType: 'payout' | 'commission_setting' | 'seller_profile';
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

/**
 * Append-only audit trail for admin financial mutations.
 *
 * `record()` takes the caller's transaction client so the audit row commits
 * atomically with the mutation it describes — a transition that rolls back
 * leaves no audit row, and a committed transition can never lack one.
 * BigInt / Decimal values are stringified so they survive the Json column.
 */
@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(private prisma: PrismaService) {}

  async record(
    tx: Prisma.TransactionClient | PrismaService,
    entry: AdminAuditEntry,
  ): Promise<void> {
    await tx.adminAuditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: toJson(entry.before),
        after: toJson(entry.after),
        reason: entry.reason ?? null,
      },
    });
    this.logger.log(
      `audit: ${entry.action} ${entry.entityType}/${entry.entityId} by ${entry.actorId}`,
    );
  }

  /** Read the trail for one entity, newest first. */
  async listForEntity(entityType: string, entityId: string) {
    return this.prisma.adminAuditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

function toJson(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value == null) return Prisma.JsonNull;
  return JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  ) as Prisma.InputJsonValue;
}
