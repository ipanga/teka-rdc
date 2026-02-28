import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SellerOrdersService } from './seller-orders.service';
import { SellerOrderQueryDto } from './dto/seller-order-query.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/sellers/orders')
@Roles('SELLER')
export class SellerOrdersController {
  constructor(private sellerOrdersService: SellerOrdersService) {}

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Query() query: SellerOrderQueryDto,
  ) {
    return this.sellerOrdersService.findSellerOrders(userId, query);
  }

  @Get(':id')
  findById(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sellerOrdersService.findSellerOrderById(userId, id);
  }

  @Patch(':id/confirm')
  confirm(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sellerOrdersService.confirmOrder(userId, id);
  }

  @Patch(':id/reject')
  reject(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectOrderDto,
  ) {
    return this.sellerOrdersService.rejectOrder(userId, id, dto.reason);
  }

  @Patch(':id/process')
  process(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sellerOrdersService.processOrder(userId, id);
  }

  @Patch(':id/ship')
  ship(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sellerOrdersService.shipOrder(userId, id);
  }

  @Patch(':id/out-for-delivery')
  outForDelivery(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sellerOrdersService.markOutForDelivery(userId, id);
  }

  @Patch(':id/deliver')
  deliver(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sellerOrdersService.deliverOrder(userId, id);
  }
}
