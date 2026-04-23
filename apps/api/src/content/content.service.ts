import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContentPageStatus } from '@prisma/client';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private prisma: PrismaService,
  ) {}

  /**
   * Get a published content page by its slug.
   */
  async getPublishedPage(slug: string) {
    const page = await this.prisma.contentPage.findUnique({
      where: { slug },
    });

    if (!page || page.status !== ContentPageStatus.PUBLISHED) {
      throw new NotFoundException('Page non trouvée');
    }

    return page;
  }

  /**
   * Get a list of all published content pages (id, slug, title, sortOrder only).
   */
  async getPublishedPagesList() {
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

    return { deleted: true };
  }
}
