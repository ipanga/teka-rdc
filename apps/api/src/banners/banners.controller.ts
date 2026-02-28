import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { BannersService } from './banners.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { BannerQueryDto } from './dto/banner-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/banners')
@Roles('ADMIN')
export class BannersController {
  constructor(private bannersService: BannersService) {}

  /**
   * GET /api/v1/admin/banners
   * List all banners with pagination and optional status filter.
   */
  @Get()
  async findAll(@Query() query: BannerQueryDto) {
    const result = await this.bannersService.findAll(query);
    return { success: true, ...result };
  }

  /**
   * POST /api/v1/admin/banners
   * Create a new banner.
   */
  @Post()
  async create(
    @Body() dto: CreateBannerDto,
    @CurrentUser('userId') userId: string,
  ) {
    const data = await this.bannersService.create(dto, userId);
    return { success: true, data };
  }

  /**
   * GET /api/v1/admin/banners/:id
   * Get a single banner by ID.
   */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.bannersService.findOne(id);
    return { success: true, data };
  }

  /**
   * PUT /api/v1/admin/banners/:id
   * Update an existing banner.
   */
  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBannerDto,
    @CurrentUser('userId') userId: string,
  ) {
    const data = await this.bannersService.update(id, dto, userId);
    return { success: true, data };
  }

  /**
   * DELETE /api/v1/admin/banners/:id
   * Soft-delete a banner.
   */
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.bannersService.remove(id);
    return { success: true, data };
  }
}
