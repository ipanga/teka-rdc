import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Logger,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CommissionService } from './commission.service';
import { UpsertCommissionDto } from './dto/upsert-commission.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/commission-settings')
export class CommissionController {
  private readonly logger = new Logger(CommissionController.name);

  constructor(private commissionService: CommissionService) {}

  /**
   * List all commission settings (global + per-category).
   * GET /api/v1/admin/commission-settings
   */
  @Get()
  @Roles('ADMIN')
  async listSettings() {
    const data = await this.commissionService.listSettings();
    return { success: true, data };
  }

  /**
   * Upsert the global commission rate (categoryId = null).
   * PUT /api/v1/admin/commission-settings
   */
  @Put()
  @Roles('ADMIN')
  async upsertGlobal(@Body() dto: UpsertCommissionDto) {
    // Force categoryId to null for the global rate
    dto.categoryId = null;
    const data = await this.commissionService.upsertSetting(dto);
    return { success: true, data };
  }

  /**
   * Upsert a category-specific commission rate.
   * PUT /api/v1/admin/commission-settings/:categoryId
   */
  @Put(':categoryId')
  @Roles('ADMIN')
  async upsertForCategory(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpsertCommissionDto,
  ) {
    dto.categoryId = categoryId;
    const data = await this.commissionService.upsertSetting(dto);
    return { success: true, data };
  }

  /**
   * Remove a category-specific commission override.
   * DELETE /api/v1/admin/commission-settings/:categoryId
   */
  @Delete(':categoryId')
  @Roles('ADMIN')
  async removeOverride(@Param('categoryId', ParseUUIDPipe) categoryId: string) {
    const data = await this.commissionService.removeOverride(categoryId);
    return { success: true, data };
  }
}
