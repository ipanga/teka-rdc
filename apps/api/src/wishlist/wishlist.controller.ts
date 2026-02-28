import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { WishlistQueryDto } from './dto/wishlist-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/wishlist')
@Roles('BUYER')
export class WishlistController {
  constructor(private wishlistService: WishlistService) {}

  /**
   * POST /api/v1/wishlist/:productId
   * Add a product to the wishlist. Idempotent.
   */
  @Post(':productId')
  async add(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    const data = await this.wishlistService.addToWishlist(userId, productId);
    return { success: true, data };
  }

  /**
   * DELETE /api/v1/wishlist/:productId
   * Remove a product from the wishlist. Idempotent.
   */
  @Delete(':productId')
  async remove(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    const data = await this.wishlistService.removeFromWishlist(
      userId,
      productId,
    );
    return { success: true, data };
  }

  /**
   * GET /api/v1/wishlist
   * Get the user's paginated wishlist with product details.
   */
  @Get()
  async getWishlist(
    @CurrentUser('userId') userId: string,
    @Query() query: WishlistQueryDto,
  ) {
    const result = await this.wishlistService.getWishlist(userId, query);
    return { success: true, data: result.data, meta: result.pagination };
  }

  /**
   * GET /api/v1/wishlist/check
   * Get wishlist product IDs for batch checking.
   * Query param: ?productIds=id1,id2,id3
   */
  @Get('check')
  async checkProducts(
    @CurrentUser('userId') userId: string,
    @Query('productIds') productIds?: string,
  ) {
    const ids = productIds
      ? productIds
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      : undefined;

    const data = await this.wishlistService.getWishlistProductIds(userId, ids);
    return { success: true, data };
  }

  /**
   * GET /api/v1/wishlist/:productId/status
   * Check if a specific product is in the wishlist.
   */
  @Get(':productId/status')
  async checkStatus(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    const data = await this.wishlistService.isInWishlist(userId, productId);
    return { success: true, data };
  }
}
