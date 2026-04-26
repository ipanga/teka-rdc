import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionType, PromotionStatus, Prisma } from '@prisma/client';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { SellerCreatePromotionDto } from './dto/seller-create-promotion.dto';
import { PromotionQueryDto } from './dto/promotion-query.dto';

@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Admin Methods ───────────────────────────────────────────────────

  /**
   * Admin: paginated list of promotions with filters.
   */
  async findAll(query: PromotionQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.PromotionWhereInput = {
      deletedAt: null,
    };

    if (query.type) {
      where.type = query.type;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [promotions, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        include: {
          product: {
            select: { id: true, title: true, priceCDF: true },
          },
          category: {
            select: { id: true, name: true },
          },
          seller: {
            select: { id: true, firstName: true, lastName: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.promotion.count({ where }),
    ]);

    return {
      data: promotions.map((p) => this.serializePromotion(p)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Admin: full promotion detail.
   */
  async findOne(id: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, deletedAt: null },
      include: {
        product: {
          select: { id: true, title: true, priceCDF: true },
        },
        category: {
          select: { id: true, name: true },
        },
        seller: {
          select: { id: true, firstName: true, lastName: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!promotion) {
      throw new NotFoundException('Promotion non trouvée');
    }

    return this.serializePromotion(promotion);
  }

  /**
   * Admin: create a promotion (status based on dates).
   */
  async create(dto: CreatePromotionDto, userId: string) {
    this.validateDiscount(dto.discountPercent, dto.discountCDF);
    this.validateDates(dto.startsAt, dto.endsAt);

    const now = new Date();
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    // Admin-created promotions: ACTIVE if startsAt <= now, otherwise DRAFT
    let status: PromotionStatus = PromotionStatus.DRAFT;
    if (startsAt <= now && endsAt > now) {
      status = PromotionStatus.ACTIVE;
    }

    const promotion = await this.prisma.promotion.create({
      data: {
        type: dto.type,
        title: dto.title,
        description: dto.description ?? undefined,
        discountPercent: dto.discountPercent,
        discountCDF: dto.discountCDF ? BigInt(dto.discountCDF) : undefined,
        status,
        startsAt,
        endsAt,
        productId: dto.productId,
        categoryId: dto.categoryId,
        sellerId: dto.sellerId,
        createdById: userId,
        approvedById: status === PromotionStatus.ACTIVE ? userId : undefined,
        approvedAt: status === PromotionStatus.ACTIVE ? now : undefined,
      },
      include: {
        product: {
          select: { id: true, title: true, priceCDF: true },
        },
        category: {
          select: { id: true, name: true },
        },
      },
    });

    this.logger.log(`Promotion ${promotion.id} created by admin ${userId}`);

    return this.serializePromotion(promotion);
  }

  /**
   * Admin: update a promotion.
   */
  async update(id: string, dto: UpdatePromotionDto) {
    const existing = await this.prisma.promotion.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Promotion non trouvée');
    }

    if (dto.discountPercent !== undefined || dto.discountCDF !== undefined) {
      this.validateDiscount(
        dto.discountPercent ?? existing.discountPercent ?? undefined,
        dto.discountCDF ??
          (existing.discountCDF ? Number(existing.discountCDF) : undefined),
      );
    }

    if (dto.startsAt || dto.endsAt) {
      this.validateDates(
        dto.startsAt ?? existing.startsAt.toISOString(),
        dto.endsAt ?? existing.endsAt.toISOString(),
      );
    }

    const data: Prisma.PromotionUpdateInput = {};

    if (dto.type !== undefined) data.type = dto.type;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description ?? null;
    if (dto.discountPercent !== undefined)
      data.discountPercent = dto.discountPercent;
    if (dto.discountCDF !== undefined)
      data.discountCDF = BigInt(dto.discountCDF);
    if (dto.startsAt !== undefined) data.startsAt = new Date(dto.startsAt);
    if (dto.endsAt !== undefined) data.endsAt = new Date(dto.endsAt);
    if (dto.productId !== undefined)
      data.product = { connect: { id: dto.productId } };
    if (dto.categoryId !== undefined)
      data.category = { connect: { id: dto.categoryId } };
    if (dto.sellerId !== undefined)
      data.seller = { connect: { id: dto.sellerId } };

    const promotion = await this.prisma.promotion.update({
      where: { id },
      data,
      include: {
        product: {
          select: { id: true, title: true, priceCDF: true },
        },
        category: {
          select: { id: true, name: true },
        },
      },
    });

    this.logger.log(`Promotion ${id} updated`);

    return this.serializePromotion(promotion);
  }

  /**
   * Admin: approve a promotion.
   */
  async approve(id: string, adminId: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, deletedAt: null },
    });

    if (!promotion) {
      throw new NotFoundException('Promotion non trouvée');
    }

    if (
      promotion.status !== PromotionStatus.PENDING_APPROVAL &&
      promotion.status !== PromotionStatus.DRAFT
    ) {
      throw new BadRequestException(
        `Impossible d'approuver une promotion au statut ${promotion.status}`,
      );
    }

    const now = new Date();
    const startsAt = promotion.startsAt;
    const endsAt = promotion.endsAt;

    // If current time is within the promotion window, set as ACTIVE
    let newStatus: PromotionStatus = PromotionStatus.APPROVED;
    if (startsAt <= now && endsAt > now) {
      newStatus = PromotionStatus.ACTIVE;
    }

    const updated = await this.prisma.promotion.update({
      where: { id },
      data: {
        status: newStatus,
        approvedById: adminId,
        approvedAt: now,
      },
      include: {
        product: {
          select: { id: true, title: true, priceCDF: true },
        },
        category: {
          select: { id: true, name: true },
        },
      },
    });

    this.logger.log(
      `Promotion ${id} approved by admin ${adminId} → ${newStatus}`,
    );

    return this.serializePromotion(updated);
  }

  /**
   * Admin: reject a promotion.
   */
  async reject(id: string, adminId: string, reason: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, deletedAt: null },
    });

    if (!promotion) {
      throw new NotFoundException('Promotion non trouvée');
    }

    if (
      promotion.status !== PromotionStatus.PENDING_APPROVAL &&
      promotion.status !== PromotionStatus.DRAFT
    ) {
      throw new BadRequestException(
        `Impossible de rejeter une promotion au statut ${promotion.status}`,
      );
    }

    const updated = await this.prisma.promotion.update({
      where: { id },
      data: {
        status: PromotionStatus.REJECTED,
        rejectionReason: reason,
        approvedById: adminId,
      },
      include: {
        product: {
          select: { id: true, title: true, priceCDF: true },
        },
        category: {
          select: { id: true, name: true },
        },
      },
    });

    this.logger.log(`Promotion ${id} rejected by admin ${adminId}`);

    return this.serializePromotion(updated);
  }

  /**
   * Admin: soft-delete a promotion.
   */
  async remove(id: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, deletedAt: null },
    });

    if (!promotion) {
      throw new NotFoundException('Promotion non trouvée');
    }

    await this.prisma.promotion.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Promotion ${id} soft-deleted`);

    return { deleted: true };
  }

  // ─── Seller Methods ──────────────────────────────────────────────────

  /**
   * Seller: create a promotion (status = PENDING_APPROVAL).
   * Verifies productId belongs to the seller.
   */
  async sellerCreate(dto: SellerCreatePromotionDto, sellerId: string) {
    this.validateDiscount(dto.discountPercent, dto.discountCDF);
    this.validateDates(dto.startsAt, dto.endsAt);

    // Verify product belongs to seller
    const product = await this.prisma.product.findFirst({
      where: {
        id: dto.productId,
        sellerId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!product) {
      throw new BadRequestException(
        'Produit non trouvé ou ne vous appartient pas',
      );
    }

    const promotion = await this.prisma.promotion.create({
      data: {
        type: dto.type,
        title: dto.title,
        description: dto.description ?? undefined,
        discountPercent: dto.discountPercent,
        discountCDF: dto.discountCDF ? BigInt(dto.discountCDF) : undefined,
        status: PromotionStatus.PENDING_APPROVAL,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        productId: dto.productId,
        sellerId,
        createdById: sellerId,
      },
      include: {
        product: {
          select: { id: true, title: true, priceCDF: true },
        },
      },
    });

    this.logger.log(
      `Promotion ${promotion.id} created by seller ${sellerId} (PENDING_APPROVAL)`,
    );

    return this.serializePromotion(promotion);
  }

  /**
   * Seller: paginated list of own promotions.
   */
  async sellerFindAll(sellerId: string, query: PromotionQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.PromotionWhereInput = {
      sellerId,
      deletedAt: null,
    };

    if (query.type) {
      where.type = query.type;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [promotions, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        include: {
          product: {
            select: { id: true, title: true, priceCDF: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.promotion.count({ where }),
    ]);

    return {
      data: promotions.map((p) => this.serializePromotion(p)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Seller: single promotion detail (ownership verified).
   */
  async sellerFindOne(id: string, sellerId: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, sellerId, deletedAt: null },
      include: {
        product: {
          select: { id: true, title: true, priceCDF: true },
        },
      },
    });

    if (!promotion) {
      throw new NotFoundException(
        'Promotion non trouvée ou ne vous appartient pas',
      );
    }

    return this.serializePromotion(promotion);
  }

  /**
   * Seller: cancel a promotion (only if PENDING_APPROVAL or DRAFT).
   */
  async sellerCancel(id: string, sellerId: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, sellerId, deletedAt: null },
    });

    if (!promotion) {
      throw new NotFoundException(
        'Promotion non trouvée ou ne vous appartient pas',
      );
    }

    if (
      promotion.status !== PromotionStatus.PENDING_APPROVAL &&
      promotion.status !== PromotionStatus.DRAFT
    ) {
      throw new BadRequestException(
        `Impossible d'annuler une promotion au statut ${promotion.status}`,
      );
    }

    await this.prisma.promotion.update({
      where: { id },
      data: { status: PromotionStatus.CANCELLED },
    });

    this.logger.log(`Promotion ${id} cancelled by seller ${sellerId}`);

    return { cancelled: true };
  }

  // ─── Public Methods ──────────────────────────────────────────────────

  /**
   * Public: active promotions (type=PROMOTION, status=ACTIVE, within date range).
   */
  async getActivePromotions() {
    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: {
        type: PromotionType.PROMOTION,
        status: PromotionStatus.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gt: now },
        deletedAt: null,
      },
      include: {
        product: {
          select: { id: true, title: true, priceCDF: true },
        },
        category: {
          select: { id: true, name: true },
        },
      },
      orderBy: { startsAt: 'desc' },
      take: 50,
    });

    return promotions.map((p) => this.serializePromotion(p));
  }

  /**
   * Public: active flash deals (type=FLASH_DEAL, status=ACTIVE, within date range)
   * with product info (title, priceCDF, first image).
   */
  async getActiveFlashDeals() {
    const now = new Date();
    const deals = await this.prisma.promotion.findMany({
      where: {
        type: PromotionType.FLASH_DEAL,
        status: PromotionStatus.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gt: now },
        deletedAt: null,
      },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            priceCDF: true,
            images: {
              select: { url: true, thumbnailUrl: true },
              orderBy: { displayOrder: 'asc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { endsAt: 'asc' },
      take: 50,
    });

    return deals.map((d) => {
      const base = this.serializePromotion(d);
      return {
        ...base,
        product: d.product
          ? {
              id: d.product.id,
              title: d.product.title,
              priceCDF: d.product.priceCDF.toString(),
              image: d.product.images[0] ?? null,
            }
          : null,
      };
    });
  }

  /**
   * Public: single active promotion with product details.
   */
  async findPublicById(id: string) {
    const now = new Date();
    const promotion = await this.prisma.promotion.findFirst({
      where: {
        id,
        status: PromotionStatus.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gt: now },
        deletedAt: null,
      },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            priceCDF: true,
            priceUSD: true,
            images: {
              select: {
                id: true,
                url: true,
                thumbnailUrl: true,
                displayOrder: true,
              },
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
        category: {
          select: { id: true, name: true },
        },
      },
    });

    if (!promotion) {
      throw new NotFoundException('Promotion non trouvée ou expirée');
    }

    return this.serializePromotion(promotion);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  /**
   * Validates that at least one discount type is provided.
   */
  private validateDiscount(discountPercent?: number, discountCDF?: number) {
    if (!discountPercent && !discountCDF) {
      throw new BadRequestException(
        'Au moins un type de réduction est requis (pourcentage ou montant CDF)',
      );
    }
  }

  /**
   * Validates that endsAt is after startsAt.
   */
  private validateDates(startsAt: string, endsAt: string) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);

    if (end <= start) {
      throw new BadRequestException(
        'La date de fin doit être postérieure à la date de début',
      );
    }
  }

  /**
   * Serializes a promotion, converting BigInt fields to strings.
   */
  private serializePromotion(
    promotion: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...promotion };

    if (result.discountCDF !== null && result.discountCDF !== undefined) {
      result.discountCDF = (result.discountCDF as bigint).toString();
    }

    // Serialize nested product priceCDF if present
    if (result.product && typeof result.product === 'object') {
      const product = { ...(result.product as Record<string, unknown>) };
      if (product.priceCDF !== null && product.priceCDF !== undefined) {
        product.priceCDF = (product.priceCDF as bigint).toString();
      }
      if (product.priceUSD !== null && product.priceUSD !== undefined) {
        product.priceUSD = (product.priceUSD as bigint).toString();
      }
      result.product = product;
    }

    return result;
  }
}
