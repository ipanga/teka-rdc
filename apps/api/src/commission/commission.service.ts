import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertCommissionDto } from './dto/upsert-commission.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { AdminAuditService } from '../audit/admin-audit.service';
import { CommissionSource } from '@prisma/client';
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

  // ---------------------------------------------------------------------------
  // Per-seller override (PR 5). `SellerProfile.commissionRate`: NULL = follow
  // the category / platform rates; 0 = a real 0 %. Changes only affect
  // earnings created after them — every delivered order keeps its own
  // snapshot (EarningsService.createEarning).
  // ---------------------------------------------------------------------------

  /** Parse + normalise a rate through the integer representation (0.1 ≡ 0.1000). */
  private normaliseRate(input: number | string | Decimal): Decimal {
    try {
      return unitsToRate(rateToUnits(new Decimal(input)));
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Taux de commission invalide',
      );
    }
  }

  /**
   * Effective commission context for one seller, as the admin sees it:
   * the override (if any), the platform default, which one applies, how many
   * active category rates could still take precedence over the default, and
   * the last audited change on this seller.
   */
  async getSellerCommission(sellerProfileId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { id: sellerProfileId },
      select: { id: true, businessName: true, commissionRate: true },
    });
    if (!profile) {
      throw new NotFoundException('Vendeur non trouvé');
    }

    const [global, activeCategoryOverrides, lastChange] = await Promise.all([
      this.prisma.commissionSetting.findFirst({
        where: { categoryId: null, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, rate: true, updatedAt: true },
      }),
      this.prisma.commissionSetting.count({
        where: { categoryId: { not: null }, isActive: true },
      }),
      this.prisma.adminAuditLog.findFirst({
        where: { entityType: 'seller_profile', entityId: sellerProfileId },
        orderBy: { createdAt: 'desc' },
        select: {
          action: true,
          actorId: true,
          before: true,
          after: true,
          createdAt: true,
        },
      }),
    ]);

    const override = profile.commissionRate;
    const hasOverride = override != null;
    const effective = hasOverride ? override : (global?.rate ?? null);
    const effectiveSource: CommissionSource | null = hasOverride
      ? CommissionSource.SELLER
      : global
        ? CommissionSource.GLOBAL
        : null;

    let actorName: { id: string; firstName: string | null; lastName: string | null } | null = null;
    if (lastChange) {
      const actor = await this.prisma.user.findUnique({
        where: { id: lastChange.actorId },
        select: { id: true, firstName: true, lastName: true },
      });
      actorName = actor ?? { id: lastChange.actorId, firstName: null, lastName: null };
    }

    return {
      sellerProfileId: profile.id,
      businessName: profile.businessName,
      overrideRate: hasOverride ? override.toString() : null,
      platformDefaultRate: global ? global.rate.toString() : null,
      effectiveRate: effective ? effective.toString() : effective === null ? null : '0',
      effectiveSource,
      activeCategoryOverrides,
      lastChange: lastChange
        ? {
            action: lastChange.action,
            actor: actorName,
            before: lastChange.before,
            after: lastChange.after,
            createdAt: lastChange.createdAt,
          }
        : null,
    };
  }

  /**
   * Set the seller override. Conditional update on the previous value so two
   * admins editing at once cannot silently overwrite each other (409 for the
   * loser); no audit row when the value is unchanged.
   */
  async setSellerOverride(
    sellerProfileId: string,
    rateInput: number,
    actorId: string,
  ) {
    const rate = this.normaliseRate(rateInput);

    const changed = await this.prisma.$transaction(async (tx) => {
      const before = await tx.sellerProfile.findUnique({
        where: { id: sellerProfileId },
        select: { id: true, commissionRate: true },
      });
      if (!before) {
        throw new NotFoundException('Vendeur non trouvé');
      }
      if (before.commissionRate != null && before.commissionRate.equals(rate)) {
        return false;
      }

      const res = await tx.sellerProfile.updateMany({
        where: { id: sellerProfileId, commissionRate: before.commissionRate },
        data: { commissionRate: rate },
      });
      if (res.count !== 1) {
        throw new ConflictException(
          'Le taux de ce vendeur a été modifié entre-temps. Rechargez la page et réessayez.',
        );
      }

      await this.audit.record(tx, {
        actorId,
        action: 'SELLER_COMMISSION_OVERRIDE_SET',
        entityType: 'seller_profile',
        entityId: sellerProfileId,
        before: { commissionRate: before.commissionRate?.toString() ?? null },
        after: { commissionRate: rate.toString() },
      });
      this.logger.log(
        `Seller commission override set: sellerProfileId=${sellerProfileId}, rate=${rate}, by=${actorId}`,
      );
      return true;
    });

    return { changed, ...(await this.getSellerCommission(sellerProfileId)) };
  }

  /** Remove the override. Idempotent: nothing to remove → no write, no audit row. */
  async clearSellerOverride(sellerProfileId: string, actorId: string) {
    const changed = await this.prisma.$transaction(async (tx) => {
      const before = await tx.sellerProfile.findUnique({
        where: { id: sellerProfileId },
        select: { id: true, commissionRate: true },
      });
      if (!before) {
        throw new NotFoundException('Vendeur non trouvé');
      }
      if (before.commissionRate == null) {
        return false;
      }

      const res = await tx.sellerProfile.updateMany({
        where: { id: sellerProfileId, commissionRate: before.commissionRate },
        data: { commissionRate: null },
      });
      if (res.count !== 1) {
        throw new ConflictException(
          'Le taux de ce vendeur a été modifié entre-temps. Rechargez la page et réessayez.',
        );
      }

      await this.audit.record(tx, {
        actorId,
        action: 'SELLER_COMMISSION_OVERRIDE_CLEARED',
        entityType: 'seller_profile',
        entityId: sellerProfileId,
        before: { commissionRate: before.commissionRate.toString() },
        after: { commissionRate: null },
      });
      this.logger.log(
        `Seller commission override cleared: sellerProfileId=${sellerProfileId}, by=${actorId}`,
      );
      return true;
    });

    return { changed, ...(await this.getSellerCommission(sellerProfileId)) };
  }

  /**
   * Audit history of every commission change (platform, category, seller
   * override), newest first, with actor and entity labels resolved.
   */
  async listHistory(limit = 30) {
    const rows = await this.prisma.adminAuditLog.findMany({
      where: { entityType: { in: ['commission_setting', 'seller_profile'] } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const json = (v: unknown) =>
      v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    const actorIds = Array.from(new Set(rows.map((r) => r.actorId)));
    const sellerIds = Array.from(
      new Set(
        rows.filter((r) => r.entityType === 'seller_profile').map((r) => r.entityId),
      ),
    );
    const categoryIds = Array.from(
      new Set(
        rows
          .filter((r) => r.entityType === 'commission_setting')
          .map((r) => (json(r.after).categoryId ?? json(r.before).categoryId) as string | null | undefined)
          .filter((id): id is string => typeof id === 'string'),
      ),
    );

    const [actors, sellers, categories] = await Promise.all([
      actorIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : ([] as { id: string; firstName: string | null; lastName: string | null }[]),
      sellerIds.length
        ? this.prisma.sellerProfile.findMany({
            where: { id: { in: sellerIds } },
            select: { id: true, businessName: true },
          })
        : ([] as { id: string; businessName: string }[]),
      categoryIds.length
        ? this.prisma.category.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, name: true },
          })
        : ([] as { id: string; name: string }[]),
    ]);

    return rows.map((r) => {
      const actor = actors.find((a) => a.id === r.actorId) ?? null;
      let target: { kind: 'PLATFORM' | 'CATEGORY' | 'SELLER'; label: string; id: string };
      if (r.entityType === 'seller_profile') {
        target = {
          kind: 'SELLER',
          id: r.entityId,
          label: sellers.find((s) => s.id === r.entityId)?.businessName ?? 'Vendeur supprimé',
        };
      } else {
        const categoryId = (json(r.after).categoryId ?? json(r.before).categoryId) as string | null | undefined;
        target = categoryId
          ? {
              kind: 'CATEGORY',
              id: categoryId,
              label: categories.find((c) => c.id === categoryId)?.name ?? 'Catégorie supprimée',
            }
          : { kind: 'PLATFORM', id: r.entityId, label: 'Taux par défaut de la plateforme' };
      }
      const beforeRate = (json(r.before).rate ?? json(r.before).commissionRate ?? null) as string | null;
      const afterRate = (json(r.after).rate ?? json(r.after).commissionRate ?? null) as string | null;
      return {
        id: r.id,
        action: r.action,
        createdAt: r.createdAt,
        actor: actor ?? { id: r.actorId, firstName: null, lastName: null },
        target,
        beforeRate,
        afterRate,
      };
    });
  }
}
