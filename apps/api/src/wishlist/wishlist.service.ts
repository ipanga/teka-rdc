import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductStatus } from '@prisma/client';
import { WishlistQueryDto } from './dto/wishlist-query.dto';

/** Prisma select for product details in wishlist responses */
const WISHLIST_PRODUCT_SELECT = {
  id: true,
  title: true,
  priceCDF: true,
  priceUSD: true,
  condition: true,
  quantity: true,
  status: true,
  deletedAt: true,
  avgRating: true,
  totalReviews: true,
  images: {
    select: {
      thumbnailUrl: true,
    },
    orderBy: { displayOrder: 'asc' as const },
    take: 1,
  },
  seller: {
    select: {
      sellerProfile: {
        select: {
          businessName: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class WishlistService {
  private readonly logger = new Logger(WishlistService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Adds a product to the user's wishlist.
   * Idempotent: if already in wishlist, returns the existing entry.
   */
  async addToWishlist(userId: string, productId: string) {
    // Verify product exists and is active
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, status: true, deletedAt: true },
    });

    if (!product || product.deletedAt !== null) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Upsert for idempotency
    const entry = await this.prisma.wishlist.upsert({
      where: {
        userId_productId: { userId, productId },
      },
      create: {
        userId,
        productId,
      },
      update: {},
      include: {
        product: {
          select: WISHLIST_PRODUCT_SELECT,
        },
      },
    });

    this.logger.log(
      `Product ${productId} added to wishlist for user ${userId}`,
    );

    return entry;
  }

  /**
   * Removes a product from the user's wishlist.
   * Idempotent: returns success even if the product was not in the wishlist.
   */
  async removeFromWishlist(userId: string, productId: string) {
    const existing = await this.prisma.wishlist.findUnique({
      where: {
        userId_productId: { userId, productId },
      },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.wishlist.delete({
        where: { id: existing.id },
      });

      this.logger.log(
        `Product ${productId} removed from wishlist for user ${userId}`,
      );
    }

    return { removed: true };
  }

  /**
   * Gets the user's paginated wishlist with product details.
   * Only returns products that are active and not deleted.
   */
  async getWishlist(userId: string, query: WishlistQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      product: {
        deletedAt: null,
        status: ProductStatus.ACTIVE,
      },
    };

    const [entries, total] = await Promise.all([
      this.prisma.wishlist.findMany({
        where,
        include: {
          product: {
            select: WISHLIST_PRODUCT_SELECT,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.wishlist.count({ where }),
    ]);

    return {
      data: entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Returns an array of product IDs currently in the user's wishlist.
   * Useful for batch checking on product listing pages.
   * Optionally filter by specific product IDs.
   */
  async getWishlistProductIds(
    userId: string,
    productIds?: string[],
  ): Promise<string[]> {
    const where: Record<string, unknown> = { userId };

    if (productIds && productIds.length > 0) {
      where.productId = { in: productIds };
    }

    const entries = await this.prisma.wishlist.findMany({
      where,
      select: { productId: true },
    });

    return entries.map((entry) => entry.productId);
  }

  /**
   * Checks if a specific product is in the user's wishlist.
   */
  async isInWishlist(
    userId: string,
    productId: string,
  ): Promise<{ isInWishlist: boolean }> {
    const entry = await this.prisma.wishlist.findUnique({
      where: {
        userId_productId: { userId, productId },
      },
      select: { id: true },
    });

    return { isInWishlist: !!entry };
  }
}
