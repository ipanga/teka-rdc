import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';
import {
  CreateBrandDto,
  UpdateBrandDto,
  SetBrandCategoriesDto,
} from './dto/brand.dto';

@Injectable()
export class BrandsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Public/seller: active, non-deleted brands. When `categoryId` is given,
   * only brands linked to that (sub)category are returned — this powers the
   * brand dropdown in seller forms and the brand filter facet on buyer search.
   */
  async getActiveBrands(categoryId?: string) {
    return this.prisma.brand.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(categoryId ? { categories: { some: { categoryId } } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, logoUrl: true },
    });
  }

  /**
   * Admin: every non-deleted brand (active + inactive), with product count and
   * the subcategory ids it's linked to.
   */
  async getAllBrands() {
    const brands = await this.prisma.brand.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        categories: { select: { categoryId: true } },
        _count: { select: { products: true } },
      },
    });
    return brands.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      logoUrl: b.logoUrl,
      isActive: b.isActive,
      sortOrder: b.sortOrder,
      productCount: b._count.products,
      categoryIds: b.categories.map((c) => c.categoryId),
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));
  }

  async getBrandById(id: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
      include: {
        categories: { select: { categoryId: true } },
        _count: { select: { products: true } },
      },
    });
    if (!brand) throw new NotFoundException('Marque non trouvée');
    return {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      logoUrl: brand.logoUrl,
      isActive: brand.isActive,
      sortOrder: brand.sortOrder,
      productCount: brand._count.products,
      categoryIds: brand.categories.map((c) => c.categoryId),
    };
  }

  async createBrand(dto: CreateBrandDto) {
    const name = dto.name.trim();
    const slug = slugify(name);

    await this.assertNameAndSlugFree(name, slug);
    if (dto.categoryIds?.length) {
      await this.assertCategoriesExist(dto.categoryIds);
    }

    const brand = await this.prisma.brand.create({
      data: {
        name,
        slug,
        logoUrl: dto.logoUrl ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        categories: dto.categoryIds?.length
          ? { create: dto.categoryIds.map((categoryId) => ({ categoryId })) }
          : undefined,
      },
    });
    return this.getBrandById(brand.id);
  }

  async updateBrand(id: string, dto: UpdateBrandDto) {
    const existing = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Marque non trouvée');

    const data: Prisma.BrandUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const slug = slugify(name);
      await this.assertNameAndSlugFree(name, slug, id);
      data.name = name;
      data.slug = slug;
    }
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    if (dto.categoryIds !== undefined) {
      await this.assertCategoriesExist(dto.categoryIds);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.brand.update({ where: { id }, data });
      if (dto.categoryIds !== undefined) {
        await tx.brandCategory.deleteMany({ where: { brandId: id } });
        if (dto.categoryIds.length) {
          await tx.brandCategory.createMany({
            data: dto.categoryIds.map((categoryId) => ({
              brandId: id,
              categoryId,
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    return this.getBrandById(id);
  }

  async setActive(id: string, isActive: boolean) {
    const existing = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Marque non trouvée');
    await this.prisma.brand.update({ where: { id }, data: { isActive } });
    return this.getBrandById(id);
  }

  /** Replace the set of subcategories this brand is offered in. */
  async setCategories(id: string, dto: SetBrandCategoriesDto) {
    const existing = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Marque non trouvée');
    await this.assertCategoriesExist(dto.categoryIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.brandCategory.deleteMany({ where: { brandId: id } });
      if (dto.categoryIds.length) {
        await tx.brandCategory.createMany({
          data: dto.categoryIds.map((categoryId) => ({
            brandId: id,
            categoryId,
          })),
          skipDuplicates: true,
        });
      }
    });
    return this.getBrandById(id);
  }

  /**
   * Soft-delete a brand: set deletedAt + isActive false and drop its category
   * links (so it leaves the filter facets). Products keep their brandId — the
   * row still exists for historical display. To consolidate a brand that has
   * products, use merge instead.
   */
  async softDelete(id: string) {
    const existing = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Marque non trouvée');

    await this.prisma.$transaction(async (tx) => {
      await tx.brandCategory.deleteMany({ where: { brandId: id } });
      await tx.brand.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      });
    });
    return { deleted: true };
  }

  /**
   * Merge `sourceId` into `targetId`: every product on the source brand is
   * reassigned to the target, the source's category links are absorbed by the
   * target (deduped), and the source brand is soft-deleted. Idempotent-safe and
   * transactional.
   */
  async mergeBrands(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      throw new BadRequestException(
        'Impossible de fusionner une marque avec elle-même',
      );
    }
    const [source, target] = await Promise.all([
      this.prisma.brand.findFirst({ where: { id: sourceId, deletedAt: null } }),
      this.prisma.brand.findFirst({ where: { id: targetId, deletedAt: null } }),
    ]);
    if (!source) throw new NotFoundException('Marque source non trouvée');
    if (!target) throw new NotFoundException('Marque cible non trouvée');

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Reassign products.
      const moved = await tx.product.updateMany({
        where: { brandId: sourceId },
        data: { brandId: targetId },
      });

      // 2. Absorb category links the target doesn't already have.
      const sourceLinks = await tx.brandCategory.findMany({
        where: { brandId: sourceId },
        select: { categoryId: true },
      });
      if (sourceLinks.length) {
        await tx.brandCategory.createMany({
          data: sourceLinks.map((l) => ({
            brandId: targetId,
            categoryId: l.categoryId,
          })),
          skipDuplicates: true,
        });
      }
      await tx.brandCategory.deleteMany({ where: { brandId: sourceId } });

      // 3. Soft-delete the source.
      await tx.brand.update({
        where: { id: sourceId },
        data: { isActive: false, deletedAt: new Date() },
      });

      return { productsMoved: moved.count };
    });

    return {
      merged: true,
      sourceId,
      targetId,
      productsMoved: result.productsMoved,
    };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async assertNameAndSlugFree(
    name: string,
    slug: string,
    excludeId?: string,
  ) {
    const clash = await this.prisma.brand.findFirst({
      where: {
        deletedAt: null,
        OR: [{ name }, { slug }],
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException('Une marque avec ce nom existe déjà');
    }
  }

  private async assertCategoriesExist(categoryIds: string[]) {
    if (!categoryIds.length) return;
    const found = await this.prisma.category.count({
      where: { id: { in: categoryIds } },
    });
    if (found !== categoryIds.length) {
      throw new BadRequestException(
        "Une ou plusieurs catégories n'existent pas",
      );
    }
  }
}
