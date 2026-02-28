import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ContentPageStatus } from '@prisma/client';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';

const PAGE_CACHE_TTL = 900; // 15 minutes
const PAGES_LIST_CACHE_KEY = 'content:pages:list';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Get a published content page by its slug.
   * Cached in Redis for 15 minutes.
   */
  async getPublishedPage(slug: string) {
    const cacheKey = `content:page:${slug}`;

    // Try cache first
    try {
      const cached = await this.redis.getJson(cacheKey);
      if (cached) {
        this.logger.debug(`Returning cached content page: ${slug}`);
        return cached;
      }
    } catch (err) {
      this.logger.warn('Redis cache read failed for content page', err);
    }

    const page = await this.prisma.contentPage.findUnique({
      where: { slug },
    });

    if (!page || page.status !== ContentPageStatus.PUBLISHED) {
      throw new NotFoundException('Page non trouvée');
    }

    // Cache result
    try {
      await this.redis.setJson(cacheKey, page, PAGE_CACHE_TTL);
    } catch (err) {
      this.logger.warn('Redis cache write failed for content page', err);
    }

    return page;
  }

  /**
   * Get a list of all published content pages (id, slug, title, sortOrder only).
   * Cached in Redis for 15 minutes.
   */
  async getPublishedPagesList() {
    // Try cache first
    try {
      const cached = await this.redis.getJson(PAGES_LIST_CACHE_KEY);
      if (cached) {
        this.logger.debug('Returning cached content pages list');
        return cached;
      }
    } catch (err) {
      this.logger.warn('Redis cache read failed for content pages list', err);
    }

    const pages = await this.prisma.contentPage.findMany({
      where: { status: ContentPageStatus.PUBLISHED },
      select: {
        id: true,
        slug: true,
        title: true,
        sortOrder: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Cache result
    try {
      await this.redis.setJson(PAGES_LIST_CACHE_KEY, pages, PAGE_CACHE_TTL);
    } catch (err) {
      this.logger.warn('Redis cache write failed for content pages list', err);
    }

    return pages;
  }

  /**
   * Get all content pages for admin (all statuses).
   */
  async findAll() {
    const pages = await this.prisma.contentPage.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        updatedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return pages;
  }

  /**
   * Create a new content page.
   */
  async create(dto: CreateContentDto, userId: string) {
    // Check slug uniqueness
    const existing = await this.prisma.contentPage.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        `Une page avec le slug "${dto.slug}" existe déjà`,
      );
    }

    const page = await this.prisma.contentPage.create({
      data: {
        slug: dto.slug,
        title: dto.title as unknown as Record<string, string>,
        content: dto.content as unknown as Record<string, string>,
        status: dto.status ?? ContentPageStatus.DRAFT,
        sortOrder: dto.sortOrder ?? 0,
        updatedById: userId,
      },
    });

    this.logger.log(`Content page created: ${page.slug} by user ${userId}`);

    // Invalidate list cache if published
    if (page.status === ContentPageStatus.PUBLISHED) {
      await this.invalidateListCache();
    }

    return page;
  }

  /**
   * Find a single content page by ID.
   */
  async findOne(id: string) {
    const page = await this.prisma.contentPage.findUnique({
      where: { id },
      include: {
        updatedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!page) {
      throw new NotFoundException('Page non trouvée');
    }

    return page;
  }

  /**
   * Update an existing content page.
   * Invalidates the Redis cache for the page slug and the pages list.
   */
  async update(id: string, dto: UpdateContentDto, userId: string) {
    const existing = await this.findOne(id);

    // If slug is being changed, check uniqueness
    if (dto.slug && dto.slug !== existing.slug) {
      const slugConflict = await this.prisma.contentPage.findUnique({
        where: { slug: dto.slug },
        select: { id: true },
      });
      if (slugConflict) {
        throw new ConflictException(
          `Une page avec le slug "${dto.slug}" existe déjà`,
        );
      }
    }

    const data: Record<string, unknown> = {
      updatedById: userId,
    };

    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.title !== undefined) {
      data.title = dto.title as unknown as Record<string, string>;
    }
    if (dto.content !== undefined) {
      data.content = dto.content as unknown as Record<string, string>;
    }
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const page = await this.prisma.contentPage.update({
      where: { id },
      data,
    });

    this.logger.log(`Content page updated: ${page.slug} by user ${userId}`);

    // Invalidate caches: old slug, new slug (if changed), and list
    try {
      await this.redis.del(`content:page:${existing.slug}`);
      if (dto.slug && dto.slug !== existing.slug) {
        await this.redis.del(`content:page:${dto.slug}`);
      }
      await this.invalidateListCache();
    } catch (err) {
      this.logger.warn('Redis cache invalidation failed for content page', err);
    }

    return page;
  }

  /**
   * Delete a content page permanently.
   */
  async remove(id: string) {
    const page = await this.findOne(id);

    await this.prisma.contentPage.delete({
      where: { id },
    });

    this.logger.log(`Content page deleted: ${page.slug}`);

    // Invalidate caches
    try {
      await this.redis.del(`content:page:${page.slug}`);
      await this.invalidateListCache();
    } catch (err) {
      this.logger.warn('Redis cache invalidation failed for content page', err);
    }

    return { deleted: true };
  }

  // ─── Private Helpers ───────────────────────────────────────────────

  private async invalidateListCache() {
    try {
      await this.redis.del(PAGES_LIST_CACHE_KEY);
    } catch (err) {
      this.logger.warn('Redis cache invalidation failed for pages list', err);
    }
  }
}
