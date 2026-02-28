import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { MergeCartDto } from './dto/merge-cart.dto';

@Controller('v1/cart')
export class CartController {
  constructor(private cartService: CartService) {}

  @Get()
  getCart(@CurrentUser('userId') userId: string) {
    return this.cartService.getCart(userId);
  }

  @Post('items')
  addItem(
    @CurrentUser('userId') userId: string,
    @Body() dto: AddToCartDto,
  ) {
    return this.cartService.addItem(userId, dto);
  }

  @Patch('items/:productId')
  updateQuantity(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateQuantity(userId, productId, dto.quantity);
  }

  @Delete('items/:productId')
  removeItem(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.cartService.removeItem(userId, productId);
  }

  @Delete()
  clearCart(@CurrentUser('userId') userId: string) {
    return this.cartService.clearCart(userId);
  }

  @Post('merge')
  mergeGuestCart(
    @CurrentUser('userId') userId: string,
    @Body() dto: MergeCartDto,
  ) {
    return this.cartService.mergeGuestCart(userId, dto.items);
  }
}
