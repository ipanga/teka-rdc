import { Controller, Get } from '@nestjs/common';
import { BannersService } from './banners.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1/browse/banners')
@Public()
export class BannersPublicController {
  constructor(private bannersService: BannersService) {}

  /**
   * GET /api/v1/browse/banners
   * Returns currently active banners. Refreshes banner statuses first,
   * then returns cached active banners.
   */
  @Get()
  async getActiveBanners() {
    // Refresh statuses (SCHEDULED → ACTIVE, ACTIVE → EXPIRED) before returning
    await this.bannersService.refreshActiveBanners();
    const data = await this.bannersService.getActiveBanners();
    return { success: true, data };
  }
}
