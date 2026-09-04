import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertCommissionDto } from './dto/upsert-commission.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { AdminAuditService } from '../audit/admin-audit.service';
import { rateToUnits, unitsToRate } from '../payments/commission-math';

/**
 * Platform + per-category commission settings (the seller-specific override
 * lives on SellerProfile.commissionRate — see EarningsService.resolveCommission
 * for the precedence). Every change is audited with its actor and the
 * previous/new rate. Changing a rate never touches past earnings: the rate is
 * snapshotted on each earning/order item at delivery (D4).
 */
@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AdminAuditService,
  ) {}

  /** The global (categoryId IS NULL) setting, or null when unconfigured. */
  async getGlobalRate() {
    return this.prisma.commissionSetting.findFirst({
      where: { categoryId: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** All settings with their category. */
  async listSettings() {
    return this.prisma.commissionSetting.findMany({
      orderBy: [{ categoryId: 'asc' }, { createdAt: 'desc' }],
      include: { category: { select: { id: true, name: true } } },
    });
  }

  /**
   * Upsert the global (categoryId null) or a category setting. The global row
   * is unique by construction: the oldest existing global row is updated,
   * never a second one created.
   */
  async upsertSetting(dto: UpsertCommissionDto, actorId: string) {
    const categoryId = dto.categoryId ?? null;
    // Normalise through the integer representation so 0.1 and 0.1000 are one rate.
    const rate = unitsToRate(rateToUnits(new Decimal(dto.rate)));
    const isActive = dto.isActive ?? true;

    if (categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });
      if (!category) {
        throw new NotFoundException('Catégorie non trouvée');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = categoryId
        ? await tx.commissionSetting.findUnique({ where: { categoryId } })
        : await tx.commissionSetting.findFirst({
            where: { categoryId: null },
            orderBy: { createdAt: 'asc' },
          });

      const include = { category: { select: { id: true, name: true } } };
      const saved = existing
        ? await tx.commissionSetting.update({
            where: { id: existing.id },
            data: { rate, isActive },
            include,
          })
        : await tx.commissionSetting.create({
            data: { categoryId, rate, isActive },
            include,
          });

      await this.audit.record(tx, {
        actorId,
        action: 'COMMISSION_SETTING_UPSERTED',
        entityType: 'commission_setting',
        entityId: saved.id,
        before: existing
          ? { rate: existing.rate.toString(), isActive: existing.isActive }
          : null,
        after: {
          categoryId,
          rate: saved.rate.toString(),
          isActive: saved.isActive,
        },
      });

      this.logger.log(
        `Commission setting ${existing ? 'updated' : 'created'}: id=${saved.id}, categoryId=${categoryId}, rate=${rate}, by=${actorId}`,
      );
      return saved;
    });
  }

  /** Remove a category override (the global rate cannot be removed here). */
  async removeOverride(categoryId: string, actorId: string) {
    const setting = await this.prisma.commissionSetting.findUnique({
      where: { categoryId },
    });
    if (!setting) {
      throw new NotFoundException(
        'Paramètre de commission non trouvé pour cette catégorie',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.commissionSetting.delete({ where: { id: setting.id } });
      await this.audit.record(tx, {
        actorId,
        action: 'COMMISSION_SETTING_REMOVED',
        entityType: 'commission_setting',
        entityId: setting.id,
        before: {
          categoryId,
          rate: setting.rate.toString(),
          isActive: setting.isActive,
        },
        after: null,
      });
    });

    this.logger.log(
      `Commission override removed for categoryId=${categoryId} by=${actorId}`,
    );
    return { deleted: true };
  }
}
