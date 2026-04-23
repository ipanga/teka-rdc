import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1/browse')
export class PromotionsPublicController {
  constructor(private promotionsService: PromotionsService) {}

  /**
   * GET /api/v1/browse/promotions
   * Public: list active promotions.
   */
  @Get('promotions')
  @Public()
  async getActivePromotions() {
    const data = await this.promotionsService.getActivePromotions();
    return { success: true, data };
  }

  /**
   * GET /api/v1/browse/flash-deals
   * Public: list active flash deals with product info.
   */
  @Get('flash-deals')
  @Public()
  async getActiveFlashDeals() {
    const data = await this.promotionsService.getActiveFlashDeals();
    return { success: true, data };
  }

  /**
   * GET /api/v1/browse/promotions/:id
   * Public: single active promotion detail.
   */
  @Get('promotions/:id')
  @Public()
  async findPublicById(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.promotionsService.findPublicById(id);
    return { success: true, data };
  }
}
