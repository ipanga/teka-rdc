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
import { PromotionsService } from './promotions.service';
import { SellerCreatePromotionDto } from './dto/seller-create-promotion.dto';
import { PromotionQueryDto } from './dto/promotion-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/sellers/promotions')
@Roles('SELLER')
export class SellerPromotionsController {
  constructor(private promotionsService: PromotionsService) {}

  /**
   * GET /api/v1/sellers/promotions
   * Seller: list own promotions.
   */
  @Get()
  async findAll(
    @CurrentUser('userId') sellerId: string,
    @Query() query: PromotionQueryDto,
  ) {
    const result = await this.promotionsService.sellerFindAll(sellerId, query);
    return { success: true, data: result.data, meta: result.meta };
  }

  /**
   * POST /api/v1/sellers/promotions
   * Seller: create a promotion (PENDING_APPROVAL).
   */
  @Post()
  async create(
    @CurrentUser('userId') sellerId: string,
    @Body() dto: SellerCreatePromotionDto,
  ) {
    const data = await this.promotionsService.sellerCreate(dto, sellerId);
    return { success: true, data };
  }

  /**
   * GET /api/v1/sellers/promotions/:id
   * Seller: get own promotion detail.
   */
  @Get(':id')
  async findOne(
    @CurrentUser('userId') sellerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.promotionsService.sellerFindOne(id, sellerId);
    return { success: true, data };
  }

  /**
   * DELETE /api/v1/sellers/promotions/:id
   * Seller: cancel own promotion (only if PENDING_APPROVAL or DRAFT).
   */
  @Delete(':id')
  async cancel(
    @CurrentUser('userId') sellerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.promotionsService.sellerCancel(id, sellerId);
    return { success: true, data };
  }
}
