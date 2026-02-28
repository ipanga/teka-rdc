import { Controller, Get, Put, Body, Param } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/settings')
@Roles('ADMIN')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  /**
   * GET /api/v1/admin/settings
   * List all system settings.
   */
  @Get()
  async findAll() {
    const data = await this.settingsService.findAll();
    return { success: true, data };
  }

  /**
   * PUT /api/v1/admin/settings/:key
   * Update a system setting by key.
   */
  @Put(':key')
  async updateSetting(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser('userId') userId: string,
  ) {
    const data = await this.settingsService.updateSetting(
      key,
      dto.value,
      userId,
    );
    return { success: true, data };
  }
}
