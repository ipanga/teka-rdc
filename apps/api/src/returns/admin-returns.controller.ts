import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { ReviewReturnDto } from './dto/review-return.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/returns')
@Roles('ADMIN')
export class AdminReturnsController {
  constructor(private returnsService: ReturnsService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.returnsService.listReturns({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
    });
  }

  @Post(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') adminId: string,
    @Body() dto: ReviewReturnDto,
  ) {
    return this.returnsService.approveReturn(id, adminId, dto.note);
  }

  @Post(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') adminId: string,
    @Body() dto: ReviewReturnDto,
  ) {
    return this.returnsService.rejectReturn(id, adminId, dto.note);
  }
}
