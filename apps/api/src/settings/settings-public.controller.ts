import { Controller, Get } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1/settings')
export class SettingsPublicController {
  constructor(private settingsService: SettingsService) {}

  /**
   * GET /api/v1/settings/public
   * Get public-facing settings (maintenance mode, platform announcement).
   */
  @Get('public')
  @Public()
  async getPublicSettings() {
    const data = await this.settingsService.getPublicSettings();
    return { success: true, data };
  }
}
