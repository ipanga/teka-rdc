import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminReviewQueryDto } from './dto/admin-review-query.dto';
import { ReviewStatus } from '@prisma/client';

@Injectable()
export class AdminReviewsService {
  private readonly logger = new Logger(AdminReviewsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * List all reviews with filtering and pagination for admin moderation.
   */
  async listReviews(query: AdminReviewQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status as ReviewStatus;
    }

    if (query.productId) {
      where.productId = query.productId;
    }

    if (query.buyerId) {
      where.buyerId = query.buyerId;
    }

    if (query.minRating || query.maxRating) {
      where.rating = {};
      if (query.minRating) {
        (where.rating as Record<string, unknown>).gte = query.minRating;
      }
      if (query.maxRating) {
        (where.rating as Record<string, unknown>).lte = query.maxRating;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
          product: {
            select: {
              id: true,
              title: true,
              sellerId: true,
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
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Hide a review (set status to HIDDEN) and recalculate product + seller ratings.
   */
  async hideReview(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId, deletedAt: null },
    });

    if (!review) {
      throw new NotFoundException('Avis non trouvé');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.review.update({
        where: { id: reviewId },
        data: { status: ReviewStatus.HIDDEN },
      });

      await this.recalculateRatings(tx, review.productId);

      this.logger.log(`Review ${reviewId} hidden by admin`);

      return updated;
    });
  }

  /**
   * Unhide a review (set status to ACTIVE) and recalculate product + seller ratings.
   */
  async unhideReview(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId, deletedAt: null },
    });

    if (!review) {
      throw new NotFoundException('Avis non trouvé');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.review.update({
        where: { id: reviewId },
        data: { status: ReviewStatus.ACTIVE },
      });

      await this.recalculateRatings(tx, review.productId);

      this.logger.log(`Review ${reviewId} unhidden by admin`);

      return updated;
    });
  }

  /**
   * Soft-delete a review and recalculate product + seller ratings.
   */
  async deleteReview(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId, deletedAt: null },
    });

    if (!review) {
      throw new NotFoundException('Avis non trouvé');
    }

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.review.update({
        where: { id: reviewId },
        data: { deletedAt: new Date() },
      });

      await this.recalculateRatings(tx, review.productId);

      this.logger.log(`Review ${reviewId} soft-deleted by admin`);

      return deleted;
    });
  }

  /**
   * Recalculate average rating and total review count for a product and its seller.
   */
  private async recalculateRatings(tx: any, productId: string) {
    const stats = await tx.review.aggregate({
      where: { productId, deletedAt: null, status: 'ACTIVE' },
      _avg: { rating: true },
      _count: true,
    });

    await tx.product.update({
      where: { id: productId },
      data: {
        avgRating: stats._avg.rating ?? 0,
        totalReviews: stats._count,
      },
    });

    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { sellerId: true },
    });

    if (product) {
      const sellerStats = await tx.review.aggregate({
        where: {
          product: { sellerId: product.sellerId },
          deletedAt: null,
          status: 'ACTIVE',
        },
        _avg: { rating: true },
        _count: true,
      });

      const sellerProfile = await tx.sellerProfile.findUnique({
        where: { userId: product.sellerId },
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
}
