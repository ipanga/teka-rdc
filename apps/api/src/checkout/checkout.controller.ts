import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';
import { QuoteDto } from './dto/quote.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/checkout')
@Roles('BUYER')
export class CheckoutController {
  constructor(private checkoutService: CheckoutService) {}

  @Post()
  checkout(@CurrentUser('userId') userId: string, @Body() dto: CheckoutDto) {
    return this.checkoutService.checkout(userId, dto);
  }

  /**
   * Preview the per-seller subtotal + delivery fee + total for the current cart
   * and a chosen address. Read-only — no order, no stock change, no idempotency.
   * The delivery fee equals what checkout would charge.
   */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  quote(@CurrentUser('userId') userId: string, @Body() dto: QuoteDto) {
    return this.checkoutService.quote(userId, dto.deliveryAddressId);
  }
}
