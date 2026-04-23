import { Controller, Post, Body } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';
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
}
