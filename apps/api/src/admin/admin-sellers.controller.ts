import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { ReviewSellerDto } from './dto/review-seller.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('v1/admin/sellers')
@Roles('ADMIN')
export class AdminSellersController {
  constructor(private adminUsersService: AdminUsersService) {}

  @Get('applications')
  async findApplications(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    return this.adminUsersService.findSellerApplications({
      page,
      limit,
      status,
    });
  }

  @Get('applications/:id')
  async findApplication(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminUsersService.findSellerApplicationById(id);
  }

  @Patch('applications/:id')
  async reviewApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') adminId: string,
    @Body() dto: ReviewSellerDto,
  ) {
    return this.adminUsersService.reviewSellerApplication(id, adminId, dto);
  }
}
