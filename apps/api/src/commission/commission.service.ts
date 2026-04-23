import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertCommissionDto } from './dto/upsert-commission.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get the global commission rate (where categoryId IS NULL).
   * Returns null if no global rate is configured.
   */
  async getGlobalRate() {
    const setting = await this.prisma.commissionSetting.findFirst({
      where: { categoryId: null },
    });
    return setting;
  }

  /**
   * List all commission settings with category info populated.
   */
  async listSettings() {
    const settings = await this.prisma.commissionSetting.findMany({
      orderBy: [{ categoryId: 'asc' }, { createdAt: 'desc' }],
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    return settings;
  }

  /**
   * Upsert a commission setting.
   * If categoryId is null or undefined, upserts the global rate.
   * If categoryId is provided, upserts the category-specific rate.
   */
  async upsertSetting(dto: UpsertCommissionDto) {
    const categoryId = dto.categoryId ?? null;
    const rate = new Decimal(dto.rate.toFixed(4));
    const isActive = dto.isActive ?? true;

    // If categoryId is provided, verify the category exists
    if (categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });
      if (!category) {
        throw new NotFoundException('Catégorie non trouvée');
      }
    }

    // Try to find existing setting for this categoryId
    const existing = categoryId
      ? await this.prisma.commissionSetting.findUnique({
          where: { categoryId },
        })
      : await this.prisma.commissionSetting.findFirst({
          where: { categoryId: null },
        });

    if (existing) {
      const updated = await this.prisma.commissionSetting.update({
        where: { id: existing.id },
        data: { rate, isActive },
        include: {
          category: {
            select: { id: true, name: true },
          },
        },
      });
      this.logger.log(
        `Commission setting updated: id=${updated.id}, categoryId=${categoryId}, rate=${rate}`,
      );
      return updated;
    }

    const created = await this.prisma.commissionSetting.create({
      data: {
        categoryId,
        rate,
        isActive,
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    this.logger.log(
      `Commission setting created: id=${created.id}, categoryId=${categoryId}, rate=${rate}`,
    );
    return created;
  }

  /**
   * Remove a category-specific commission override.
   * Only category overrides can be removed (not the global rate via this method).
   */
  async removeOverride(categoryId: string) {
    const setting = await this.prisma.commissionSetting.findUnique({
      where: { categoryId },
    });

    if (!setting) {
      throw new NotFoundException(
        'Paramètre de commission non trouvé pour cette catégorie',
      );
    }

    await this.prisma.commissionSetting.delete({
      where: { id: setting.id },
    });

    this.logger.log(`Commission override removed for categoryId=${categoryId}`);

    return { deleted: true };
  }
}
