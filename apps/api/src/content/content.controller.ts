import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/content')
@Roles('ADMIN')
export class ContentController {
  constructor(private contentService: ContentService) {}

  /**
   * GET /api/v1/admin/content
   * List all content pages (all statuses) for admin.
   */
  @Get()
  async findAll() {
    const data = await this.contentService.findAll();
    return { success: true, data };
  }

  /**
   * POST /api/v1/admin/content
   * Create a new content page.
   */
  @Post()
  async create(
    @Body() dto: CreateContentDto,
    @CurrentUser('userId') userId: string,
  ) {
    const data = await this.contentService.create(dto, userId);
    return { success: true, data };
  }

  /**
   * GET /api/v1/admin/content/:id
   * Get a single content page by ID.
   */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.contentService.findOne(id);
    return { success: true, data };
  }

  /**
   * PUT /api/v1/admin/content/:id
   * Update a content page.
   */
  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentDto,
    @CurrentUser('userId') userId: string,
  ) {
    const data = await this.contentService.update(id, dto, userId);
    return { success: true, data };
  }

  /**
   * DELETE /api/v1/admin/content/:id
   * Delete a content page.
   */
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.contentService.remove(id);
    return { success: true, data };
  }
}
