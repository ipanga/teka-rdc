import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Logger,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { EarningsService } from '../payments/earnings.service';
import { RequestPayoutDto } from './dto/request-payout.dto';
import { PayoutQueryDto } from './dto/payout-query.dto';
import { RejectPayoutDto } from './dto/reject-payout.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Resolve sellerProfileId from userId.
 * Throws NotFoundException if the user has no seller profile.
 */
async function resolveSellerProfileId(
  prisma: PrismaService,
  userId: string,
): Promise<string> {
  const profile = await prisma.sellerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) {
    throw new NotFoundException(
      'Profil vendeur non trouvé. Veuillez compléter votre inscription vendeur.',
    );
  }
  return profile.id;
}

/**
 * Seller-facing payout & wallet endpoints.
 * Prefix: /api/v1/sellers
 */
@Controller('v1/sellers')
export class SellerPayoutsController {
  private readonly logger = new Logger(SellerPayoutsController.name);

  constructor(
    private payoutsService: PayoutsService,
    private earningsService: EarningsService,
    private prisma: PrismaService,
  ) {}

  /**
   * Request a new payout.
   * POST /api/v1/sellers/payouts
   */
  @Post('payouts')
  @Roles('SELLER')
  async requestPayout(
    @CurrentUser('sub') userId: string,
    @Body() dto: RequestPayoutDto,
  ) {
    const sellerProfileId = await resolveSellerProfileId(this.prisma, userId);
    const payout = await this.payoutsService.requestPayout(
      sellerProfileId,
      dto,
    );
    return { success: true, data: payout };
  }

  /**
   * List seller's own payouts.
   * GET /api/v1/sellers/payouts
   */
  @Get('payouts')
  @Roles('SELLER')
  async listSellerPayouts(
    @CurrentUser('sub') userId: string,
    @Query() query: PayoutQueryDto,
  ) {
    const sellerProfileId = await resolveSellerProfileId(this.prisma, userId);
    const result = await this.payoutsService.listSellerPayouts(
      sellerProfileId,
      query,
    );
    return { success: true, data: result.data, meta: result.pagination };
  }

  /**
   * Get seller wallet summary.
   * GET /api/v1/sellers/wallet
   */
  @Get('wallet')
  @Roles('SELLER')
  async getSellerWallet(@CurrentUser('sub') userId: string) {
    const sellerProfileId = await resolveSellerProfileId(this.prisma, userId);
    const wallet = await this.earningsService.getSellerWallet(sellerProfileId);
    return { success: true, data: wallet };
  }

  /**
   * List seller's earnings.
   * GET /api/v1/sellers/earnings
   */
  @Get('earnings')
  @Roles('SELLER')
  async listSellerEarnings(
    @CurrentUser('sub') userId: string,
    @Query() query: PayoutQueryDto,
  ) {
    const sellerProfileId = await resolveSellerProfileId(this.prisma, userId);
    const result = await this.earningsService.listSellerEarnings(
      sellerProfileId,
      { page: query.page, limit: query.limit },
    );
    return { success: true, data: result.data, meta: result.pagination };
  }
}

/**
 * Admin-facing payout management endpoints.
 * Prefix: /api/v1/admin/payouts
 */
@Controller('v1/admin/payouts')
export class AdminPayoutsController {
  private readonly logger = new Logger(AdminPayoutsController.name);

  constructor(private payoutsService: PayoutsService) {}

  /**
   * List all payouts across the platform.
   * GET /api/v1/admin/payouts
   */
  @Get()
  @Roles('ADMIN')
  async listAllPayouts(@Query() query: PayoutQueryDto) {
    const result = await this.payoutsService.listAllPayouts(query);
    return { success: true, data: result.data, meta: result.pagination };
  }

  /**
   * Get a specific payout by ID.
   * GET /api/v1/admin/payouts/:id
   */
  @Get(':id')
  @Roles('ADMIN')
  async getPayoutById(@Param('id', ParseUUIDPipe) id: string) {
    const payout = await this.payoutsService.getPayoutById(id);
    return { success: true, data: payout };
  }

  /**
   * Approve a payout.
   * POST /api/v1/admin/payouts/:id/approve
   */
  @Post(':id/approve')
  @Roles('ADMIN')
  async approvePayout(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminId: string,
  ) {
    const payout = await this.payoutsService.approvePayout(id, adminId);
    return { success: true, data: payout };
  }

  /**
   * Reject a payout.
   * POST /api/v1/admin/payouts/:id/reject
   */
  @Post(':id/reject')
  @Roles('ADMIN')
  async rejectPayout(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminId: string,
    @Body() dto: RejectPayoutDto,
  ) {
    const payout = await this.payoutsService.rejectPayout(
      id,
      adminId,
      dto.reason,
    );
    return { success: true, data: payout };
  }
}
