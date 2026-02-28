import { Controller, Get, Post, Patch, Body } from '@nestjs/common';
import { SellersService } from './sellers.service';
import { ApplySellerDto } from './dto/apply-seller.dto';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/sellers')
export class SellersController {
  constructor(private sellersService: SellersService) {}

  @Post('apply')
  @Roles('BUYER')
  async apply(
    @CurrentUser('userId') userId: string,
    @Body() dto: ApplySellerDto,
  ) {
    return this.sellersService.apply(userId, dto);
  }

  @Get('application')
  async getApplication(@CurrentUser('userId') userId: string) {
    return this.sellersService.getApplication(userId);
  }

  @Get('profile')
  @Roles('SELLER')
  async getProfile(@CurrentUser('userId') userId: string) {
    return this.sellersService.getProfile(userId);
  }

  @Patch('profile')
  @Roles('SELLER')
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateSellerProfileDto,
  ) {
    return this.sellersService.updateProfile(userId, dto);
  }
}
