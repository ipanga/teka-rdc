import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BannerStatus } from '@prisma/client';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { BannerQueryDto } from './dto/banner-query.dto';

@Injectable()
export class BannersService {
  private readonly logger = new Logger(BannersService.name);

  constructor(
    private prisma: PrismaService,
  ) {}

  /**
   * Returns active banners that are currently within their schedule window.
   */
  async getActiveBanners() {
    const now = new Date();

    const banners = await this.prisma.banner.findMany({
      where: {
        status: BannerStatus.ACTIVE,
        deletedAt: null,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [
          {
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
        ],
      },
      orderBy: { sortOrder: 'asc' },
    });

    return banners;
  }

  /**
   * Refreshes banner statuses based on schedule:
   * - SCHEDULED banners where startsAt <= now → set to ACTIVE
   * - ACTIVE banners where endsAt < now → set to EXPIRED
   */
  async refreshActiveBanners() {
    const now = new Date();

    // Activate scheduled banners whose start time has arrived
    const activated = await this.prisma.banner.updateMany({
      where: {
        status: BannerStatus.SCHEDULED,
        startsAt: { lte: now },
        deletedAt: null,
      },
      data: { status: BannerStatus.ACTIVE },
    });

    if (activated.count > 0) {
      this.logger.log(`Activated ${activated.count} scheduled banner(s)`);
    }

    // Expire active banners whose end time has passed
    const expired = await this.prisma.banner.updateMany({
      where: {
        status: BannerStatus.ACTIVE,
        endsAt: { lt: now },
        deletedAt: null,
      },
      data: { status: BannerStatus.EXPIRED },
    });

    if (expired.count > 0) {
      this.logger.log(`Expired ${expired.count} active banner(s)`);
    }
  }

  /**
   * Paginated list of banners for admin panel.
   * Supports optional status filter.
   */
  async findAll(query: BannerQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }

    const [banners, total] = await Promise.all([
      this.prisma.banner.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.banner.count({ where }),
    ]);

    return {
      data: banners,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find a single banner by ID.
   */
  async findOne(id: string) {
    const banner = await this.prisma.banner.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!banner || banner.deletedAt !== null) {
      throw new NotFoundException('Bannière non trouvée');
    }

    return banner;
  }

  /**
   * Create a new banner.
   */
  async create(dto: CreateBannerDto, userId: string) {
    const banner = await this.prisma.banner.create({
      data: {
        title: dto.title as unknown as Record<string, string>,
        subtitle: dto.subtitle
          ? (dto.subtitle as unknown as Record<string, string>)
          : undefined,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl,
        linkType: dto.linkType,
        linkTarget: dto.linkTarget,
        status: dto.status ?? BannerStatus.DRAFT,
        sortOrder: dto.sortOrder ?? 0,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        createdById: userId,
      },
    });

    this.logger.log(`Banner created: ${banner.id} by user ${userId}`);

    return banner;
  }

  /**
   * Update an existing banner.
   */
  async update(id: string, dto: UpdateBannerDto, userId: string) {
    // Verify banner exists
    await this.findOne(id);

    const data: Record<string, unknown> = {};

    if (dto.title !== undefined) {
      data.title = dto.title as unknown as Record<string, string>;
    }
    if (dto.subtitle !== undefined) {
      data.subtitle = dto.subtitle as unknown as Record<string, string>;
    }
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.linkUrl !== undefined) data.linkUrl = dto.linkUrl;
    if (dto.linkType !== undefined) data.linkType = dto.linkType;
    if (dto.linkTarget !== undefined) data.linkTarget = dto.linkTarget;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.startsAt !== undefined) {
      data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    }
    if (dto.endsAt !== undefined) {
      data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    }

    const banner = await this.prisma.banner.update({
      where: { id },
      data,
    });

    this.logger.log(`Banner updated: ${banner.id} by user ${userId}`);

    return banner;
  }

  /**
   * Soft delete a banner (set deletedAt timestamp).
   */
  async remove(id: string) {
    // Verify banner exists
    await this.findOne(id);

    await this.prisma.banner.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Banner soft-deleted: ${id}`);

    return { deleted: true };
  }
}
