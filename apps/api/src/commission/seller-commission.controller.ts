import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { CommissionService } from './commission.service';
import { SetSellerCommissionDto } from './dto/set-seller-commission.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Per-seller commission override (D3: seller override → leaf category →
 * platform default). Keyed by SellerProfile.id — the row that carries the rate
 * and the audit entity. ADMIN only, like the platform settings.
 */
@Controller('v1/admin/sellers/:sellerProfileId/commission')
@Roles('ADMIN')
export class SellerCommissionController {
  constructor(private commissionService: CommissionService) {}

  /** Effective rate context: override, platform default, what applies, last change. */
  @Get()
  async get(@Param('sellerProfileId', ParseUUIDPipe) sellerProfileId: string) {
    const data = await this.commissionService.getSellerCommission(sellerProfileId);
    return { success: true, data };
  }

  /** Set (or change) the override. Audited; 409 if edited concurrently. */
  @Put()
  async set(
    @Param('sellerProfileId', ParseUUIDPipe) sellerProfileId: string,
    @Body() dto: SetSellerCommissionDto,
    @CurrentUser('userId') adminId: string,
  ) {
    const data = await this.commissionService.setSellerOverride(
      sellerProfileId,
      dto.rate,
      adminId,
    );
    return { success: true, data };
  }

  /** Remove the override → the seller follows category / platform rates again. */
  @Delete()
  async clear(
    @Param('sellerProfileId', ParseUUIDPipe) sellerProfileId: string,
    @CurrentUser('userId') adminId: string,
  ) {
    const data = await this.commissionService.clearSellerOverride(
      sellerProfileId,
      adminId,
    );
    return { success: true, data };
  }
}
