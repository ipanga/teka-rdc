import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { BroadcastsService } from './broadcasts.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { BroadcastQueryDto } from './dto/broadcast-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/broadcasts')
@Roles('ADMIN')
export class BroadcastsController {
  constructor(private broadcastsService: BroadcastsService) {}

  /**
   * GET /api/v1/admin/broadcasts
   * Admin: list all broadcasts (paginated).
   */
  @Get()
  async findAll(@Query() query: BroadcastQueryDto) {
    const result = await this.broadcastsService.findAll(query);
    return { success: true, data: result.data, meta: result.meta };
  }

  /**
   * POST /api/v1/admin/broadcasts
   * Admin: create a new broadcast.
   */
  @Post()
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateBroadcastDto,
  ) {
    const data = await this.broadcastsService.create(dto, userId);
    return { success: true, data };
  }

  /**
   * GET /api/v1/admin/broadcasts/:id
   * Admin: get broadcast detail.
   */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.broadcastsService.findOne(id);
    return { success: true, data };
  }

  /**
   * POST /api/v1/admin/broadcasts/:id/send
   * Admin: trigger broadcast sending.
   */
  @Post(':id/send')
  async send(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.broadcastsService.send(id);
    return { success: true, data };
  }

  /**
   * DELETE /api/v1/admin/broadcasts/:id
   * Admin: delete a broadcast (only DRAFT).
   */
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.broadcastsService.remove(id);
    return { success: true, data };
  }
}
