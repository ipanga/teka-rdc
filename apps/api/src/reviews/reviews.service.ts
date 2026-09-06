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
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewQueryDto, ReviewSortOption } from './dto/review-query.dto';
import { SellerNotificationService } from '../notifications/seller-notification.service';
import { VISIBLE_REVIEW_WHERE } from './review-visibility';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private prisma: PrismaService,
    private sellerNotifications: SellerNotificationService,
  ) {}

  /**
   * Checks if a buyer is eligible to review a specific product.
   * Buyer must have a DELIVERED order containing the product,
   * and must not have already reviewed it.
   */
  async canReview(
    buyerId: string,
    productId: string,
  ): Promise<{ canReview: boolean; reason?: string; orderId?: string }> {
    // Check if buyer has a DELIVERED order containing this product. Fetch the
    // order id so the client can echo it back on POST /reviews (the create DTO
    // requires a valid orderId — without it every submission 400s).
    const deliveredOrderItem = await this.prisma.orderItem.findFirst({
      where: {
        productId,
        order: {
          buyerId,
          status: OrderStatus.DELIVERED,
          deletedAt: null,
        },
      },
      // Most recent eligible order first, so the returned orderId is stable.
      orderBy: { createdAt: 'desc' },
      select: { orderId: true },
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

    return { canReview: true, orderId: deliveredOrderItem.orderId };
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
            // Legacy client with no title field → stored as null. Never
            // fabricated; see CreateReviewDto.
            title: dto.title?.trim() || null,
            text: dto.text?.trim() || null,
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
      { timeout: 30000 },
    );

    this.logger.log(
      `Review created by buyer ${buyerId} for product ${dto.productId}`,
    );

    // Fire-and-forget seller push. Errors are caught + logged inside
    // the service; we don't await so the review POST doesn't wait
    // on FCM latency.
    void this.sellerNotifications.notifyNewReview({
      id: review.id,
      rating: review.rating,
      productId: dto.productId,
    });

    return review;
  }

  /**
   * Gets paginated reviews for a product.
   * Only returns VISIBLE reviews (VISIBLE_REVIEW_WHERE) with buyer info — the
   * exact set the stats count and average.
   */
  async getProductReviews(productId: string, query: ReviewQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    // Build where clause
    // Same predicate as the stats and the denormalised caches — see
    // review-visibility.ts.
    const where: Record<string, unknown> = {
      productId,
      ...VISIBLE_REVIEW_WHERE,
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
        where: { productId, ...VISIBLE_REVIEW_WHERE },
        _avg: { rating: true },
        _count: true,
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { productId, ...VISIBLE_REVIEW_WHERE },
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
  /**
   * Updates the buyer's own review in place.
   *
   * Updates, never inserts: the row is located by id and guarded by ownership,
   * so editing cannot produce a duplicate. (`@@unique([buyerId, productId])`
   * would reject one anyway, but the guarantee here is intentional, not
   * incidental.)
   *
   * Eligibility is NOT re-evaluated. The delivered-purchase check already ran
   * when the review was created, and productId/orderId are not editable (see
   * UpdateReviewDto), so the link to a delivered order the buyer owns cannot be
   * changed by an edit. Re-running canReview() would in fact reject every edit,
   * because it reports ALREADY_REVIEWED once a review exists.
   *
   * Moderation status is deliberately left untouched. Teka has no pre-publish
   * moderation queue — reviews are created ACTIVE and an admin may later set
   * HIDDEN — so an edit must not flip a hidden review back to ACTIVE, which
   * would let a buyer launder moderated content by editing it.
   */
  async updateReview(buyerId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        buyerId: true,
        productId: true,
        rating: true,
        deletedAt: true,
      },
    });

    if (!review || review.deletedAt !== null) {
      throw new NotFoundException('Avis non trouvé');
    }

    if (review.buyerId !== buyerId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres avis',
      );
    }

    const ratingChanged = review.rating !== dto.rating;

    const updated = await this.prisma.$transaction(
      async (tx) => {
        const result = await tx.review.update({
          where: { id: reviewId },
          data: {
            rating: dto.rating,
            // Legacy client with no title field → stored as null. Never
            // fabricated; see CreateReviewDto.
            title: dto.title?.trim() || null,
            text: dto.text?.trim() || null,
            // status intentionally omitted — see the doc comment above.
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

        // Only the rating feeds the aggregates; skip the recalculation when a
        // buyer only fixed their wording.
        if (ratingChanged) {
          await this.recalculateRatings(tx, review.productId);
        }

        return result;
      },
      { timeout: 30000 },
    );

    this.logger.log(
      `Review ${reviewId} updated by buyer ${buyerId}` +
        (ratingChanged ? ' (rating changed — aggregates recalculated)' : ''),
    );

    return updated;
  }

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
      { timeout: 30000 },
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
      where: { productId, ...VISIBLE_REVIEW_WHERE },
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
          ...VISIBLE_REVIEW_WHERE,
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
