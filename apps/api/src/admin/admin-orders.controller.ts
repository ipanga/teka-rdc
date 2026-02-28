import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AdminOrdersService } from './admin-orders.service';
import { AdminOrderQueryDto } from './dto/admin-order-query.dto';
import { ForceStatusDto } from './dto/force-status.dto';
import { CancelOrderDto } from '../orders/dto/cancel-order.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/orders')
@Roles('ADMIN')
export class AdminOrdersController {
  constructor(private adminOrdersService: AdminOrdersService) {}

  @Get()
  findAll(@Query() query: AdminOrderQueryDto) {
    return this.adminOrdersService.findAllOrders(query);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminOrdersService.findOrderById(id);
  }

  @Patch(':id/status')
  forceStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') adminId: string,
    @Body() dto: ForceStatusDto,
  ) {
    return this.adminOrdersService.forceStatusChange(id, dto.status, adminId, dto.note);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') adminId: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.adminOrdersService.adminCancelOrder(id, adminId, dto.reason ?? '');
  }
}
