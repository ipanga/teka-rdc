import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { UuidParam } from '../common/pipes/uuid-param.pipe';
import { OrderQueryDto } from './dto/order-query.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { RequestReturnDto } from './dto/request-return.dto';
import { ReturnsService } from '../returns/returns.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('v1/orders')
export class OrdersController {
  constructor(
    private ordersService: OrdersService,
    private returnsService: ReturnsService,
  ) {}

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
    @Param('id', UuidParam) id: string,
  ) {
    return this.ordersService.findBuyerOrderById(userId, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser('userId') userId: string,
    @Param('id', UuidParam) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(userId, id, dto.reason);
  }

  /** Buyer requests a return — DELIVERED order, within the 2-day window. */
  @Post(':id/return')
  requestReturn(
    @CurrentUser('userId') userId: string,
    @Param('id', UuidParam) id: string,
    @Body() dto: RequestReturnDto,
  ) {
    return this.returnsService.createReturnRequest(userId, id, dto.reason);
  }
}
