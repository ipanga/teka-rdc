import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductStatus, Prisma } from '@prisma/client';
import { BrowseProductsQueryDto } from './dto/browse-products-query.dto';
import { isShortCode } from '../common/utils/slugify';

@Injectable()
export class BrowseService {
  private readonly logger = new Logger(BrowseService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Returns active categories as a tree with ACTIVE product counts.
   */
  async getCategories() {
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
    const map = new Map<
      string,
      (typeof categories)[0] & {
        subcategories: typeof categories;
        productCount: number;
      }
    >();
    const roots: ((typeof categories)[0] & {
      subcategories: typeof categories;
      productCount: number;
    })[] = [];

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
        map
          .get(cat.parentCategoryId)!
          .subcategories.push(node as (typeof categories)[0]);
      } else {
        roots.push(node);
      }
    }

    // Roll up subcategory counts into the parent. Products are assigned to
    // leaf (sub)categories, never directly to a top-level category, so the
    // parent's _count.products is always 0 in our seed. Without this rollup
    // the homepage shows "0 produits" under every main category card even
    // though the catalog has 152 products.
    for (const root of roots) {
      const subTotal = root.subcategories.reduce(
        (sum, sub) =>
          sum + ((sub as { productCount?: number }).productCount ?? 0),
        0,
      );
      root.productCount = root.productCount + subTotal;
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

    if (query.cityId) {
      where.cityId = query.cityId;
    }

    // The expanded category-id set (self + sub + sub-sub), shared by the Prisma
    // path and the raw FTS search path so both filter identically.
    let categoryIds: string[] | null = null;
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
      categoryIds = childCategories.map((c) => c.id);
      where.categoryId = { in: categoryIds };
    }

    if (query.condition) {
      where.condition = query.condition;
    }

    if (query.minPrice || query.maxPrice) {
      where.priceCDF = {};
      if (query.minPrice) {
        (where.priceCDF as Record<string, unknown>).gte = BigInt(
          query.minPrice,
        );
      }
      if (query.maxPrice) {
        (where.priceCDF as Record<string, unknown>).lte = BigInt(
          query.maxPrice,
        );
      }
    }

    if (query.minRating) {
      where.avgRating = { gte: query.minRating };
    }

    // Product fields returned to clients — shared by the default Prisma path
    // and the full-text search path (which hydrates by id with the same shape).
    const productSelect = {
      id: true,
      slug: true,
      shortCode: true,
      title: true,
      priceCDF: true,
      priceUSD: true,
      condition: true,
      quantity: true,
      categoryId: true,
      cityId: true,
      avgRating: true,
      totalReviews: true,
      unitsSold: true,
      createdAt: true,
      // City slug/name lets clients build `/{ville}/{slug}-{shortCode}` URLs
      // on mixed-city listings (e.g. the global homepage).
      city: { select: { slug: true, name: true } },
      images: {
        orderBy: { displayOrder: 'asc' as const },
        take: 1,
        select: { id: true, url: true, thumbnailUrl: true, displayOrder: true },
      },
      seller: {
        select: { sellerProfile: { select: { businessName: true } } },
      },
    } satisfies Prisma.ProductSelect;
    type ProductRow = Prisma.ProductGetPayload<{
      select: typeof productSelect;
    }>;

    let data: ProductRow[];
    let total: number;
    let hasMore: boolean;
    let nextCursor: string | null;

    if (query.search) {
      // Full-text search (Postgres FTS + pg_trgm). Prisma can't ORDER BY
      // ts_rank, so ranking is raw SQL: a relevance-ordered id list (real
      // above demo → ts_rank → trigram similarity → recency), then hydrated by
      // id with the shared select. The cursor encodes a simple offset over the
      // rank-ordered result set. Same filters as the default path.
      const q = query.search;
      // Accent-insensitive (f_unaccent) so "telephone" matches "Téléphones";
      // word_similarity (<%) gives one-word typo tolerance against long titles.
      const conds: Prisma.Sql[] = [
        Prisma.sql`p."status" = 'ACTIVE'`,
        Prisma.sql`p."deletedAt" IS NULL`,
        Prisma.sql`(p."search_vector" @@ websearch_to_tsquery('french', public.f_unaccent(${q})) OR public.f_unaccent(${q}) <% public.f_unaccent(p."title"))`,
      ];
      if (query.cityId) {
        conds.push(Prisma.sql`p."cityId"::text = ${query.cityId}`);
      }
      if (categoryIds && categoryIds.length > 0) {
        conds.push(
          Prisma.sql`p."categoryId"::text IN (${Prisma.join(categoryIds)})`,
        );
      }
      if (query.condition) {
        conds.push(Prisma.sql`p."condition"::text = ${query.condition}`);
      }
      if (query.minPrice) {
        conds.push(Prisma.sql`p."priceCDF" >= ${BigInt(query.minPrice)}`);
      }
      if (query.maxPrice) {
        conds.push(Prisma.sql`p."priceCDF" <= ${BigInt(query.maxPrice)}`);
      }
      if (query.minRating) {
        conds.push(Prisma.sql`p."avgRating" >= ${query.minRating}`);
      }
      const whereSql = Prisma.join(conds, ' AND ');

      const offset = query.cursor
        ? Math.max(0, parseInt(query.cursor, 10) || 0)
        : 0;
      const idRows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT p."id"
        FROM "products" p
        WHERE ${whereSql}
        ORDER BY p."isDemo" ASC,
                 ts_rank(p."search_vector", websearch_to_tsquery('french', public.f_unaccent(${q}))) DESC,
                 word_similarity(public.f_unaccent(${q}), public.f_unaccent(p."title")) DESC,
                 p."createdAt" DESC
        LIMIT ${limit + 1} OFFSET ${offset}
      `);
      hasMore = idRows.length > limit;
      const pageIds = (hasMore ? idRows.slice(0, limit) : idRows).map(
        (r) => r.id,
      );

      const countRows = await this.prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "products" p WHERE ${whereSql}`,
      );
      total = Number(countRows[0]?.count ?? 0);

      const fetched = await this.prisma.product.findMany({
        where: { id: { in: pageIds } },
        select: productSelect,
      });
      const byId = new Map(fetched.map((p) => [p.id, p]));
      // Preserve the relevance order from the raw query.
      data = pageIds
        .map((id) => byId.get(id))
        .filter((p): p is ProductRow => p != null);
      nextCursor = hasMore ? String(offset + limit) : null;
    } else {
      // Build orderBy. Real merchant products always rank above the seeded
      // "Teka RDC Officiel" demo catalog (isDemo asc → false/real first), then
      // the buyer's chosen sort within each group. Once a category's demo
      // products are retired (Phase 3 P3c) this tiebreaker becomes moot.
      let primarySort: Record<string, string>;
      switch (query.sortBy) {
        case 'price_low':
          primarySort = { priceCDF: 'asc' };
          break;
        case 'price_high':
          primarySort = { priceCDF: 'desc' };
          break;
        case 'newest':
          primarySort = { createdAt: 'desc' };
          break;
        case 'rating':
          primarySort = { avgRating: 'desc' };
          break;
        case 'popularity':
        default:
          // Real best-seller ranking: most delivered units first, recency as
          // the tiebreaker so new products aren't permanently buried.
          primarySort = { unitsSold: 'desc' };
          break;
      }
      const orderBy: Record<string, string>[] =
        query.sortBy === 'popularity' || !query.sortBy
          ? [{ isDemo: 'asc' }, primarySort, { createdAt: 'desc' }]
          : [{ isDemo: 'asc' }, primarySort];

      // Cursor-based pagination: fetch limit+1 to check hasMore
      const products = await this.prisma.product.findMany({
        where,
        orderBy,
        take: limit + 1,
        ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
        select: productSelect,
      });
      hasMore = products.length > limit;
      data = hasMore ? products.slice(0, limit) : products;
      nextCursor = hasMore ? data[data.length - 1].id : null;
      total = await this.prisma.product.count({ where });
    }

    // Transform to BrowseProduct shape
    const items = data.map((p) => ({
      id: p.id,
      slug: p.slug,
      shortCode: p.shortCode,
      title: p.title,
      priceCDF: p.priceCDF,
      priceUSD: p.priceUSD,
      condition: p.condition,
      quantity: p.quantity,
      categoryId: p.categoryId,
      cityId: p.cityId,
      citySlug: p.city?.slug ?? null,
      cityName: p.city?.name ?? null,
      avgRating: p.avgRating,
      totalReviews: p.totalReviews,
      unitsSold: p.unitsSold,
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
   * Search autocomplete: the top few relevant products (FTS + trigram, same
   * ranking as browse search) + categories whose name matches the partial
   * query. Empty for very short queries.
   */
  async searchSuggestions(q: string, cityId?: string) {
    const term = q.trim();
    if (term.length < 2) {
      return { products: [], categories: [] };
    }

    const conds: Prisma.Sql[] = [
      Prisma.sql`p."status" = 'ACTIVE'`,
      Prisma.sql`p."deletedAt" IS NULL`,
      Prisma.sql`(p."search_vector" @@ websearch_to_tsquery('french', public.f_unaccent(${term})) OR public.f_unaccent(${term}) <% public.f_unaccent(p."title"))`,
    ];
    if (cityId) {
      conds.push(Prisma.sql`p."cityId"::text = ${cityId}`);
    }
    const whereSql = Prisma.join(conds, ' AND ');

    const idRows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT p."id"
      FROM "products" p
      WHERE ${whereSql}
      ORDER BY p."isDemo" ASC,
               ts_rank(p."search_vector", websearch_to_tsquery('french', public.f_unaccent(${term}))) DESC,
               word_similarity(public.f_unaccent(${term}), public.f_unaccent(p."title")) DESC
      LIMIT 5
    `);
    const ids = idRows.map((r) => r.id);

    const fetched = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        title: true,
        slug: true,
        shortCode: true,
        cityId: true,
        city: { select: { slug: true, name: true } },
        images: {
          orderBy: { displayOrder: 'asc' },
          take: 1,
          select: { thumbnailUrl: true },
        },
      },
    });
    const byId = new Map(fetched.map((p) => [p.id, p]));
    const products = ids
      .map((id) => byId.get(id))
      .filter((p): p is (typeof fetched)[number] => p != null)
      .map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        shortCode: p.shortCode,
        cityId: p.cityId,
        citySlug: p.city?.slug ?? null,
        cityName: p.city?.name ?? null,
        thumbnailUrl: p.images[0]?.thumbnailUrl ?? null,
      }));

    // Accent-insensitive category match ("telephone" → "Téléphones").
    const categories = await this.prisma.$queryRaw<
      { id: string; name: string; slug: string | null }[]
    >(Prisma.sql`
      SELECT c."id", c."name", c."slug"
      FROM "categories" c
      WHERE c."isActive" = true
        AND c."deletedAt" IS NULL
        AND public.f_unaccent(c."name") ILIKE '%' || public.f_unaccent(${term}) || '%'
      ORDER BY c."sortOrder" ASC
      LIMIT 5
    `);

    return { products, categories };
  }

  /**
   * Returns full product detail for public viewing.
   */
  async getProductDetail(identifier: string) {
    // Resolution order (city-first URL refactor, 2026-06-06):
    //   UUID            -> by id
    //   6-char base36   -> by shortCode (the canonical URL tail)
    //   anything else   -> by slug (cosmetic; also the legacy resolver)
    // A 6-char token could legitimately be an old slug rather than a
    // shortCode, so fall back to slug on a shortCode miss.
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        identifier,
      );

    const include = {
      images: { orderBy: { displayOrder: 'asc' as const } },
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
      city: {
        select: { id: true, slug: true, name: true, province: true },
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
    };

    const primaryWhere = isUuid
      ? { id: identifier }
      : isShortCode(identifier)
        ? { shortCode: identifier }
        : { slug: identifier };

    let product = await this.prisma.product.findFirst({
      where: {
        ...primaryWhere,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      },
      include,
    });

    // Legacy fallback: the 6-char token was an old slug, not a shortCode.
    if (!product && !isUuid && isShortCode(identifier)) {
      product = await this.prisma.product.findFirst({
        where: {
          slug: identifier,
          status: ProductStatus.ACTIVE,
          deletedAt: null,
        },
        include,
      });
    }

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Build category breadcrumb. `slug` is the canonical identifier used by
    // buyer-web URLs (/categorie/<slug>); `id` is kept for backward
    // compatibility with older clients.
    const breadcrumb: {
      id: string;
      slug: string | null;
      name: unknown;
    }[] = [];
    if (product.category) {
      if (product.category.parentCategory?.parentCategory) {
        breadcrumb.push({
          id: product.category.parentCategory.parentCategory.id,
          slug: product.category.parentCategory.parentCategory.slug,
          name: product.category.parentCategory.parentCategory.name,
        });
      }
      if (product.category.parentCategory) {
        breadcrumb.push({
          id: product.category.parentCategory.id,
          slug: product.category.parentCategory.slug,
          name: product.category.parentCategory.name,
        });
      }
      breadcrumb.push({
        id: product.category.id,
        slug: product.category.slug,
        name: product.category.name,
      });
    }

    // Flatten the seller shape to match the list endpoint and the
    // BrowseSeller type used by buyer-web. Prior to this fix the detail
    // endpoint returned the raw Prisma include
    // (`seller: { id, firstName, lastName, sellerProfile: { businessName } }`),
    // while the list endpoint returned `{ id, businessName }`. The buyer-web
    // cart hydration assumed list-shape; reading `seller.businessName` was
    // undefined, which crashed the cart page (`undefined.trim()`). The PDP
    // also rendered an empty "VENDEUR" label for the same reason.
    const { seller, ...rest } = product;
    const sellerFullName = [seller.firstName, seller.lastName]
      .filter(Boolean)
      .join(' ');
    const sellerFlat = {
      id: seller.id,
      businessName:
        seller.sellerProfile?.businessName || sellerFullName || 'Vendeur',
    };

    return {
      ...rest,
      seller: sellerFlat,
      breadcrumb,
    };
  }

  /**
   * Returns a single active category by id OR slug, with its direct
   * subcategories and active product count. Used by buyer-web's category
   * detail page (/categorie/<slug>). Mirrors the UUID-or-slug pattern of
   * getProductDetail above.
   */
  async getCategoryDetail(identifier: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        identifier,
      );

    const category = await this.prisma.category.findFirst({
      where: {
        ...(isUuid ? { id: identifier } : { slug: identifier }),
        isActive: true,
        deletedAt: null,
      },
      include: {
        parentCategory: {
          select: { id: true, slug: true, name: true },
        },
        subcategories: {
          where: { isActive: true, deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            slug: true,
            name: true,
            emoji: true,
            sortOrder: true,
          },
        },
        _count: {
          select: {
            products: {
              where: { status: ProductStatus.ACTIVE, deletedAt: null },
            },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    const { _count, ...rest } = category;
    return { ...rest, productCount: _count.products };
  }

  /**
   * Returns product attributes for a category.
   * Includes attributes from the category itself and its parent categories.
   * Used by seller forms to render dynamic fields.
   */
  async getCategoryAttributes(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId, deletedAt: null },
      include: {
        parentCategory: {
          include: {
            parentCategory: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    // Collect category IDs: self + parent + grandparent
    const categoryIds = [categoryId];
    if (category.parentCategoryId) {
      categoryIds.push(category.parentCategoryId);
      if (category.parentCategory?.parentCategoryId) {
        categoryIds.push(category.parentCategory.parentCategoryId);
      }
    }

    const attributes = await this.prisma.productAttribute.findMany({
      where: {
        categoryId: { in: categoryIds },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return attributes;
  }
}
