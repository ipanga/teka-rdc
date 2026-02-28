import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderQueryDto } from './dto/order-query.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('v1/orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Query() query: OrderQueryDto,
  ) {
    return this.ordersService.findBuyerOrders(userId, query);
  }

  @Get(':id')
  findById(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.findBuyerOrderById(userId, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(userId, id, dto.reason);
  }
}
