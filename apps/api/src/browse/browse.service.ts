import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ProductStatus } from '@prisma/client';
import { BrowseProductsQueryDto } from './dto/browse-products-query.dto';

const CATEGORIES_CACHE_KEY = 'browse:categories';
const CATEGORIES_CACHE_TTL = 3600; // 1 hour
const PRODUCT_DETAIL_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class BrowseService {
  private readonly logger = new Logger(BrowseService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Returns active categories as a tree with ACTIVE product counts.
   * Cached in Redis for 1 hour.
   */
  async getCategories() {
    // Try cache first
    try {
      const cached = await this.redis.getJson(CATEGORIES_CACHE_KEY);
      if (cached) return cached;
    } catch (err) {
      this.logger.warn('Redis cache read failed for browse categories', err);
    }

    const categories = await this.prisma.category.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: {
            products: {
              where: { status: ProductStatus.ACTIVE, deletedAt: null },
            },
          },
        },
      },
    });

    // Build tree from flat list
    const map = new Map<string, typeof categories[0] & { subcategories: typeof categories; productCount: number }>();
    const roots: (typeof categories[0] & { subcategories: typeof categories; productCount: number })[] = [];

    for (const cat of categories) {
      const node = {
        ...cat,
        productCount: cat._count.products,
        subcategories: [] as typeof categories,
      };
      delete (node as Record<string, unknown>)['_count'];
      map.set(cat.id, node);
    }

    for (const cat of categories) {
      const node = map.get(cat.id)!;
      if (cat.parentCategoryId && map.has(cat.parentCategoryId)) {
        map.get(cat.parentCategoryId)!.subcategories.push(node as typeof categories[0]);
      } else {
        roots.push(node);
      }
    }

    // Cache the result
    try {
      await this.redis.setJson(CATEGORIES_CACHE_KEY, roots, CATEGORIES_CACHE_TTL);
    } catch (err) {
      this.logger.warn('Redis cache write failed for browse categories', err);
    }

    return roots;
  }

  /**
   * Returns cursor-paginated ACTIVE products with filters.
   */
  async browseProducts(query: BrowseProductsQueryDto) {
    const limit = query.limit ?? 20;

    // Build where clause
    const where: Record<string, unknown> = {
      status: ProductStatus.ACTIVE,
      deletedAt: null,
    };

    if (query.categoryId) {
      // Include subcategories: find all child category IDs
      const childCategories = await this.prisma.category.findMany({
        where: {
          OR: [
            { id: query.categoryId },
            { parentCategoryId: query.categoryId },
            {
              parentCategory: {
                parentCategoryId: query.categoryId,
              },
            },
          ],
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      });
      where.categoryId = { in: childCategories.map((c) => c.id) };
    }

    if (query.condition) {
      where.condition = query.condition;
    }

    if (query.minPrice || query.maxPrice) {
      where.priceCDF = {};
      if (query.minPrice) {
        (where.priceCDF as Record<string, unknown>).gte = BigInt(query.minPrice);
      }
      if (query.maxPrice) {
        (where.priceCDF as Record<string, unknown>).lte = BigInt(query.maxPrice);
      }
    }

    if (query.minRating) {
      where.avgRating = { gte: query.minRating };
    }

    if (query.search) {
      where.OR = [
        { title: { path: ['fr'], string_contains: query.search } },
        { title: { path: ['en'], string_contains: query.search } },
        { description: { path: ['fr'], string_contains: query.search } },
      ];
    }

    // Build orderBy
    let orderBy: Record<string, string>;
    switch (query.sortBy) {
      case 'price_low':
        orderBy = { priceCDF: 'asc' };
        break;
      case 'price_high':
        orderBy = { priceCDF: 'desc' };
        break;
      case 'newest':
        orderBy = { createdAt: 'desc' };
        break;
      case 'rating':
        orderBy = { avgRating: 'desc' };
        break;
      case 'popularity':
      default:
        orderBy = { createdAt: 'desc' }; // TODO: Add popularity metric later
        break;
    }

    // Cursor-based pagination: fetch limit+1 to check hasMore
    const products = await this.prisma.product.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(query.cursor && {
        cursor: { id: query.cursor },
        skip: 1,
      }),
      select: {
        id: true,
        title: true,
        priceCDF: true,
        priceUSD: true,
        condition: true,
        quantity: true,
        categoryId: true,
        avgRating: true,
        totalReviews: true,
        createdAt: true,
        images: {
          orderBy: { displayOrder: 'asc' },
          take: 1,
          select: {
            id: true,
            url: true,
            thumbnailUrl: true,
            displayOrder: true,
          },
        },
        seller: {
          select: {
            sellerProfile: {
              select: { businessName: true },
            },
          },
        },
      },
    });

    const hasMore = products.length > limit;
    const data = hasMore ? products.slice(0, limit) : products;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    // Get total count
    const total = await this.prisma.product.count({ where });

    // Transform to BrowseProduct shape
    const items = data.map((p) => ({
      id: p.id,
      title: p.title,
      priceCDF: p.priceCDF,
      priceUSD: p.priceUSD,
      condition: p.condition,
      quantity: p.quantity,
      categoryId: p.categoryId,
      avgRating: p.avgRating,
      totalReviews: p.totalReviews,
      image: p.images[0] ?? null,
      seller: {
        businessName: p.seller?.sellerProfile?.businessName ?? 'Vendeur',
      },
    }));

    return {
      data: items,
      pagination: {
        nextCursor,
        hasMore,
        total,
      },
    };
  }

  /**
   * Returns full product detail for public viewing.
   * Cached in Redis for 5 minutes.
   */
  async getProductDetail(productId: string) {
    const cacheKey = `browse:product:${productId}`;

    // Try cache first
    try {
      const cached = await this.redis.getJson(cacheKey);
      if (cached) return cached;
    } catch (err) {
      this.logger.warn('Redis cache read failed for product detail', err);
    }

    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      },
      include: {
        images: { orderBy: { displayOrder: 'asc' } },
        specifications: {
          include: { attribute: true },
        },
        category: {
          include: {
            parentCategory: {
              include: {
                parentCategory: true,
              },
            },
          },
        },
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            sellerProfile: {
              select: { businessName: true },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Build category breadcrumb
    const breadcrumb: { id: string; name: unknown }[] = [];
    if (product.category) {
      if (product.category.parentCategory?.parentCategory) {
        breadcrumb.push({
          id: product.category.parentCategory.parentCategory.id,
          name: product.category.parentCategory.parentCategory.name,
        });
      }
      if (product.category.parentCategory) {
        breadcrumb.push({
          id: product.category.parentCategory.id,
          name: product.category.parentCategory.name,
        });
      }
      breadcrumb.push({
        id: product.category.id,
        name: product.category.name,
      });
    }

    const result = {
      ...product,
      breadcrumb,
    };

    // Cache the result
    try {
      await this.redis.setJson(cacheKey, result, PRODUCT_DETAIL_CACHE_TTL);
    } catch (err) {
      this.logger.warn('Redis cache write failed for product detail', err);
    }

    return result;
  }
}
