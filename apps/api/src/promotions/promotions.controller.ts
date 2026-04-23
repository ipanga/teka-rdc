import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PromotionQueryDto } from './dto/promotion-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/promotions')
@Roles('ADMIN')
export class PromotionsController {
  constructor(private promotionsService: PromotionsService) {}

  /**
   * GET /api/v1/admin/promotions
   * Admin: list all promotions with filters.
   */
  @Get()
  async findAll(@Query() query: PromotionQueryDto) {
    const result = await this.promotionsService.findAll(query);
    return { success: true, data: result.data, meta: result.meta };
  }

  /**
   * POST /api/v1/admin/promotions
   * Admin: create a new promotion.
   */
  @Post()
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreatePromotionDto,
  ) {
    const data = await this.promotionsService.create(dto, userId);
    return { success: true, data };
  }

  /**
   * GET /api/v1/admin/promotions/:id
   * Admin: get promotion detail.
   */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.promotionsService.findOne(id);
    return { success: true, data };
  }

  /**
   * PUT /api/v1/admin/promotions/:id
   * Admin: update a promotion.
   */
  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromotionDto,
  ) {
    const data = await this.promotionsService.update(id, dto);
    return { success: true, data };
  }

  /**
   * POST /api/v1/admin/promotions/:id/approve
   * Admin: approve a promotion.
   */
  @Post(':id/approve')
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') adminId: string,
  ) {
    const data = await this.promotionsService.approve(id, adminId);
    return { success: true, data };
  }

  /**
   * POST /api/v1/admin/promotions/:id/reject
   * Admin: reject a promotion with reason.
   */
  @Post(':id/reject')
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') adminId: string,
    @Body('reason') reason: string,
  ) {
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw new BadRequestException('La raison du rejet est requise');
    }
    const data = await this.promotionsService.reject(
      id,
      adminId,
      reason.trim(),
    );
    return { success: true, data };
  }

  /**
   * DELETE /api/v1/admin/promotions/:id
   * Admin: soft-delete a promotion.
   */
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.promotionsService.remove(id);
    return { success: true, data };
  }
}
