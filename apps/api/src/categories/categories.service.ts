import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { AttributeType } from '@prisma/client';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Returns the full category tree (up to 3 levels deep).
   */
  async findTree() {
    const categories = await this.prisma.category.findMany({
      where: {
        parentCategoryId: null,
        deletedAt: null,
      },
      include: {
        subcategories: {
          where: { deletedAt: null },
          include: {
            subcategories: {
              where: { deletedAt: null },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        attributes: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return { data: categories };
  }

  /**
   * Returns a single category by ID with its attributes and subcategories.
   */
  async findById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id, deletedAt: null },
      include: {
        attributes: {
          orderBy: { sortOrder: 'asc' },
        },
        subcategories: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    return category;
  }

  /**
   * Creates a new category. Validates max depth of 3 levels.
   */
  async create(dto: CreateCategoryDto) {
    if (dto.parentCategoryId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentCategoryId, deletedAt: null },
      });

      if (!parent) {
        throw new NotFoundException('Catégorie parente non trouvée');
      }

      // If the parent already has a parent, it's level 2.
      // Adding a child would make level 3 — which is the maximum allowed.
      // But if the parent's parent also has a parent, that means the parent is level 3,
      // so we'd be creating level 4 — not allowed.
      if (parent.parentCategoryId) {
        const grandParent = await this.prisma.category.findUnique({
          where: { id: parent.parentCategoryId, deletedAt: null },
        });

        if (grandParent?.parentCategoryId) {
          throw new BadRequestException(
            'La profondeur maximale de catégories est de 3 niveaux',
          );
        }
      }
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        description: dto.description,
        parentCategoryId: dto.parentCategoryId,
        emoji: dto.emoji,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      include: {
        attributes: true,
        subcategories: {
          where: { deletedAt: null },
        },
      },
    });

    return category;
  }

  /**
   * Updates an existing category.
   */
  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({
      where: { id, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    // If changing parent, validate depth
    if (
      dto.parentCategoryId !== undefined &&
      dto.parentCategoryId !== category.parentCategoryId
    ) {
      if (dto.parentCategoryId) {
        const parent = await this.prisma.category.findUnique({
          where: { id: dto.parentCategoryId, deletedAt: null },
        });

        if (!parent) {
          throw new NotFoundException('Catégorie parente non trouvée');
        }

        if (parent.parentCategoryId) {
          const grandParent = await this.prisma.category.findUnique({
            where: { id: parent.parentCategoryId, deletedAt: null },
          });

          if (grandParent?.parentCategoryId) {
            throw new BadRequestException(
              'La profondeur maximale de catégories est de 3 niveaux',
            );
          }
        }
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && {
          description: dto.description,
        }),
        ...(dto.parentCategoryId !== undefined && {
          parentCategoryId: dto.parentCategoryId,
        }),
        ...(dto.emoji !== undefined && { emoji: dto.emoji }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        attributes: true,
        subcategories: {
          where: { deletedAt: null },
        },
      },
    });

    return updated;
  }

  /**
   * Soft deletes a category and all its subcategories (cascade).
   */
  async softDelete(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id, deletedAt: null },
      include: {
        subcategories: {
          where: { deletedAt: null },
          include: {
            subcategories: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    const now = new Date();
    const idsToDelete: string[] = [id];

    // Collect all subcategory IDs (level 2)
    for (const sub of category.subcategories) {
      idsToDelete.push(sub.id);
      // Collect level 3 subcategory IDs
      for (const subSub of sub.subcategories) {
        idsToDelete.push(subSub.id);
      }
    }

    await this.prisma.category.updateMany({
      where: { id: { in: idsToDelete } },
      data: { deletedAt: now },
    });

    return { message: 'Catégorie supprimée avec succès' };
  }

  /**
   * Creates a product attribute for a category.
   */
  async createAttribute(categoryId: string, dto: CreateAttributeDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    return this.prisma.productAttribute.create({
      data: {
        categoryId,
        name: dto.name,
        type: dto.type as AttributeType,
        options: dto.options ?? undefined,
        isRequired: dto.isRequired ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  /**
   * Updates a product attribute, validating it belongs to the specified category.
   */
  async updateAttribute(
    categoryId: string,
    attrId: string,
    dto: Partial<CreateAttributeDto>,
  ) {
    const attribute = await this.prisma.productAttribute.findUnique({
      where: { id: attrId },
    });

    if (!attribute || attribute.categoryId !== categoryId) {
      throw new NotFoundException('Attribut non trouvé pour cette catégorie');
    }

    return this.prisma.productAttribute.update({
      where: { id: attrId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type as AttributeType }),
        ...(dto.options !== undefined && { options: dto.options }),
        ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  /**
   * Deletes a product attribute.
   */
  async deleteAttribute(attrId: string) {
    const attribute = await this.prisma.productAttribute.findUnique({
      where: { id: attrId },
    });

    if (!attribute) {
      throw new NotFoundException('Attribut non trouvé');
    }

    await this.prisma.productAttribute.delete({
      where: { id: attrId },
    });

    return { message: 'Attribut supprimé avec succès' };
  }
}
