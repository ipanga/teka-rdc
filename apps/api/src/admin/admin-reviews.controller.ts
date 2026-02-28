import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AdminReviewsService } from './admin-reviews.service';
import { AdminReviewQueryDto } from './dto/admin-review-query.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/reviews')
@Roles('ADMIN')
export class AdminReviewsController {
  constructor(private adminReviewsService: AdminReviewsService) {}

  /**
   * List all reviews with admin filters (status, product, buyer, rating range).
   */
  @Get()
  async listReviews(@Query() query: AdminReviewQueryDto) {
    const result = await this.adminReviewsService.listReviews(query);
    return { success: true, ...result };
  }

  /**
   * Hide a review (set status to HIDDEN).
   */
  @Post(':id/hide')
  async hideReview(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.adminReviewsService.hideReview(id);
    return { success: true, data };
  }

  /**
   * Unhide a review (set status back to ACTIVE).
   */
  @Post(':id/unhide')
  async unhideReview(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.adminReviewsService.unhideReview(id);
    return { success: true, data };
  }

  /**
   * Soft-delete a review.
   */
  @Delete(':id')
  async deleteReview(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.adminReviewsService.deleteReview(id);
    return { success: true, data };
  }
}
