import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1/reviews')
export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  /**
   * POST /api/v1/reviews
   * Create a review for a product. Buyer must have a DELIVERED order.
   */
  @Post()
  @Roles('BUYER')
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateReviewDto,
  ) {
    const data = await this.reviewsService.createReview(userId, dto);
    return { success: true, data };
  }

  /**
   * GET /api/v1/reviews/products/:productId
   * Get paginated reviews for a product. Public endpoint.
   */
  @Get('products/:productId')
  @Public()
  async getProductReviews(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: ReviewQueryDto,
  ) {
    const result = await this.reviewsService.getProductReviews(
      productId,
      query,
    );
    return { success: true, data: result.data, meta: result.pagination };
  }

  /**
   * GET /api/v1/reviews/products/:productId/stats
   * Get review statistics (avg, total, distribution) for a product. Public endpoint.
   */
  @Get('products/:productId/stats')
  @Public()
  async getProductReviewStats(
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    const data = await this.reviewsService.getProductReviewStats(productId);
    return { success: true, data };
  }

  /**
   * GET /api/v1/reviews/products/:productId/mine
   * Get the current buyer's review for a specific product.
   */
  @Get('products/:productId/mine')
  @Roles('BUYER')
  async getMyReview(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    const data = await this.reviewsService.getMyReviewForProduct(
      userId,
      productId,
    );
    return { success: true, data };
  }

  /**
   * GET /api/v1/reviews/products/:productId/can-review
   * Check if the current buyer is eligible to review this product.
   */
  @Get('products/:productId/can-review')
  @Roles('BUYER')
  async canReview(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    const data = await this.reviewsService.canReview(userId, productId);
    return { success: true, data };
  }

  /**
   * DELETE /api/v1/reviews/:id
   * Soft-delete a review. Only the review author can delete their own review.
   */
  @Delete(':id')
  @Roles('BUYER')
  async delete(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.reviewsService.deleteReview(userId, id);
    return { success: true, data };
  }
}
