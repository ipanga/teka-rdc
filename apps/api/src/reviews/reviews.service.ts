import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, ReviewStatus } from '@prisma/client';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewQueryDto, ReviewSortOption } from './dto/review-query.dto';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Checks if a buyer is eligible to review a specific product.
   * Buyer must have a DELIVERED order containing the product,
   * and must not have already reviewed it.
   */
  async canReview(
    buyerId: string,
    productId: string,
  ): Promise<{ canReview: boolean; reason?: string }> {
    // Check if buyer has a DELIVERED order containing this product
    const deliveredOrderItem = await this.prisma.orderItem.findFirst({
      where: {
        productId,
        order: {
          buyerId,
          status: OrderStatus.DELIVERED,
          deletedAt: null,
        },
      },
      select: { id: true },
    });

    if (!deliveredOrderItem) {
      return {
        canReview: false,
        reason:
          'Vous devez avoir reçu ce produit avant de pouvoir laisser un avis',
      };
    }

    // Check if buyer already reviewed this product
    const existingReview = await this.prisma.review.findUnique({
      where: {
        buyerId_productId: { buyerId, productId },
      },
      select: { id: true, deletedAt: true },
    });

    if (existingReview && existingReview.deletedAt === null) {
      return {
        canReview: false,
        reason: 'Vous avez déjà laissé un avis pour ce produit',
      };
    }

    return { canReview: true };
  }

  /**
   * Creates a review for a product. Only verified buyers (with a DELIVERED order)
   * can create reviews. Uses a transaction to atomically update product and seller ratings.
   */
  async createReview(buyerId: string, dto: CreateReviewDto) {
    // Validate eligibility
    const eligibility = await this.canReview(buyerId, dto.productId);
    if (!eligibility.canReview) {
      throw new BadRequestException(eligibility.reason);
    }

    // Verify that the order belongs to the buyer and contains the product
    const order = await this.prisma.order.findFirst({
      where: {
        id: dto.orderId,
        buyerId,
        status: OrderStatus.DELIVERED,
        deletedAt: null,
        items: {
          some: { productId: dto.productId },
        },
      },
      select: { id: true },
    });

    if (!order) {
      throw new BadRequestException(
        'Commande invalide ou ne contenant pas ce produit',
      );
    }

    // Create review and recalculate ratings in a transaction
    const review = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.review.create({
          data: {
            productId: dto.productId,
            buyerId,
            orderId: dto.orderId,
            rating: dto.rating,
            text: dto.text,
            status: ReviewStatus.ACTIVE,
          },
          include: {
            buyer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        });

        await this.recalculateRatings(tx, dto.productId);

        return created;
      },
      { timeout: 60000 },
    );

    this.logger.log(
      `Review created by buyer ${buyerId} for product ${dto.productId}`,
    );

    return review;
  }

  /**
   * Gets paginated reviews for a product.
   * Only returns active, non-deleted reviews with buyer info.
   */
  async getProductReviews(productId: string, query: ReviewQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {
      productId,
      deletedAt: null,
      status: ReviewStatus.ACTIVE,
    };

    if (query.rating) {
      where.rating = query.rating;
    }

    // Build orderBy
    const orderBy = this.buildSortOrder(query.sort);

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Returns aggregated review statistics for a product:
   * average rating, total reviews, and distribution by star rating.
   */
  async getProductReviewStats(productId: string) {
    const [aggregate, distribution] = await Promise.all([
      this.prisma.review.aggregate({
        where: {
          productId,
          deletedAt: null,
          status: ReviewStatus.ACTIVE,
        },
        _avg: { rating: true },
        _count: true,
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: {
          productId,
          deletedAt: null,
          status: ReviewStatus.ACTIVE,
        },
        _count: true,
      }),
    ]);

    // Build distribution map (1-5 stars)
    const ratingDistribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    for (const entry of distribution) {
      ratingDistribution[entry.rating] = entry._count;
    }

    return {
      avgRating: aggregate._avg.rating ?? 0,
      totalReviews: aggregate._count,
      distribution: ratingDistribution,
    };
  }

  /**
   * Gets the current buyer's review for a specific product.
   * Returns null if no review exists.
   */
  async getMyReviewForProduct(buyerId: string, productId: string) {
    const review = await this.prisma.review.findUnique({
      where: {
        buyerId_productId: { buyerId, productId },
      },
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });

    if (!review || review.deletedAt !== null) {
      return null;
    }

    return review;
  }

  /**
   * Soft-deletes a review. Only the review author can delete their own review.
   * Recalculates product and seller ratings after deletion.
   */
  async deleteReview(buyerId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        buyerId: true,
        productId: true,
        deletedAt: true,
      },
    });

    if (!review || review.deletedAt !== null) {
      throw new NotFoundException('Avis non trouvé');
    }

    if (review.buyerId !== buyerId) {
      throw new ForbiddenException(
        'Vous ne pouvez supprimer que vos propres avis',
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.review.update({
          where: { id: reviewId },
          data: { deletedAt: new Date() },
        });

        await this.recalculateRatings(tx, review.productId);
      },
      { timeout: 60000 },
    );

    this.logger.log(`Review ${reviewId} soft-deleted by buyer ${buyerId}`);

    return { deleted: true };
  }

  // ─── Private Helpers ───────────────────────────────────────────────

  /**
   * Recalculates avgRating and totalReviews for both the product
   * and the seller's profile. Must be called within a transaction.
   */
  private async recalculateRatings(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    productId: string,
  ) {
    // Recalculate product ratings
    const productStats = await tx.review.aggregate({
      where: {
        productId,
        deletedAt: null,
        status: ReviewStatus.ACTIVE,
      },
      _avg: { rating: true },
      _count: true,
    });

    await tx.product.update({
      where: { id: productId },
      data: {
        avgRating: productStats._avg.rating ?? 0,
        totalReviews: productStats._count,
      },
    });

    // Get the seller for this product
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { sellerId: true },
    });

    if (product) {
      // Recalculate seller ratings across ALL their products
      const sellerStats = await tx.review.aggregate({
        where: {
          product: { sellerId: product.sellerId },
          deletedAt: null,
          status: ReviewStatus.ACTIVE,
        },
        _avg: { rating: true },
        _count: true,
      });

      const sellerProfile = await tx.sellerProfile.findUnique({
        where: { userId: product.sellerId },
        select: { id: true },
      });

      if (sellerProfile) {
        await tx.sellerProfile.update({
          where: { id: sellerProfile.id },
          data: {
            avgRating: sellerStats._avg.rating ?? 0,
            totalReviews: sellerStats._count,
          },
        });
      }
    }
  }

  /**
   * Converts a ReviewSortOption into a Prisma orderBy clause.
   */
  private buildSortOrder(sort?: ReviewSortOption) {
    switch (sort) {
      case ReviewSortOption.OLDEST:
        return { createdAt: 'asc' as const };
      case ReviewSortOption.HIGHEST:
        return { rating: 'desc' as const };
      case ReviewSortOption.LOWEST:
        return { rating: 'asc' as const };
      case ReviewSortOption.NEWEST:
      default:
        return { createdAt: 'desc' as const };
    }
  }
}
