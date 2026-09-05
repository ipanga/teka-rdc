import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UuidParam } from '../common/pipes/uuid-param.pipe';
import { SellerVerificationService } from './seller-verification.service';
import { ReviewVerificationDto } from './dto/review-verification.dto';

/**
 * Admin verification API (D8). Class-level ADMIN; the read-only status view
 * is additionally opened to SUPPORT (method-level override wins). Document
 * access links and every transition stay ADMIN-only.
 */
@Controller('v1/admin/sellers/:sellerProfileId/verification')
@Roles('ADMIN')
export class AdminSellerVerificationController {
  constructor(private verification: SellerVerificationService) {}

  @Get()
  @Roles('ADMIN', 'SUPPORT')
  async get(@Param('sellerProfileId', UuidParam) sellerProfileId: string) {
    return this.verification.getForAdmin(sellerProfileId);
  }

  @Get('documents/:documentId/url')
  @Roles('ADMIN')
  async documentUrl(
    @CurrentUser('userId') adminId: string,
    @Param('sellerProfileId', UuidParam) sellerProfileId: string,
    @Param('documentId', UuidParam) documentId: string,
  ) {
    return this.verification.documentAccessUrl(adminId, sellerProfileId, documentId);
  }

  @Post('approve')
  @Roles('ADMIN')
  async approve(
    @CurrentUser('userId') adminId: string,
    @Param('sellerProfileId', UuidParam) sellerProfileId: string,
    @Body() dto: ReviewVerificationDto,
  ) {
    return this.verification.approve(adminId, sellerProfileId, dto.reason);
  }

  @Post('reject')
  @Roles('ADMIN')
  async reject(
    @CurrentUser('userId') adminId: string,
    @Param('sellerProfileId', UuidParam) sellerProfileId: string,
    @Body() dto: ReviewVerificationDto,
  ) {
    return this.verification.reject(adminId, sellerProfileId, dto.reason);
  }

  @Post('revoke')
  @Roles('ADMIN')
  async revoke(
    @CurrentUser('userId') adminId: string,
    @Param('sellerProfileId', UuidParam) sellerProfileId: string,
    @Body() dto: ReviewVerificationDto,
  ) {
    return this.verification.revoke(adminId, sellerProfileId, dto.reason);
  }
}
