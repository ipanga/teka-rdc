import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  Headers,
  Inject,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import type { PaymentProvider } from './interfaces/payment-provider.interface';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('v1/payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private paymentsService: PaymentsService,
    @Inject('PAYMENT_PROVIDER') private paymentProvider: PaymentProvider,
  ) {}

  /**
   * Initiate a Mobile Money payment for an order.
   * POST /api/v1/payments/initiate
   */
  @Post('initiate')
  @Roles('BUYER')
  async initiatePayment(
    @CurrentUser('sub') userId: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    const result = await this.paymentsService.initiateOrderPayment(
      dto.orderId,
      {
        mobileMoneyProvider: dto.mobileMoneyProvider,
        payerPhone: dto.payerPhone,
      },
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Flexpay webhook callback (public endpoint).
   * POST /api/v1/payments/webhook/flexpay
   */
  @Post('webhook/flexpay')
  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async flexpayWebhook(
    @Body() body: unknown,
    @Headers('x-flexpay-signature') signature: string,
    @Req() req: any,
  ) {
    // Verify webhook signature
    const rawBody = JSON.stringify(body);
    const isValid = this.paymentProvider.verifyWebhookSignature(
      rawBody,
      signature ?? '',
    );

    if (!isValid) {
      this.logger.warn('Webhook signature verification failed');
      // Still return 200 to prevent retries on invalid signatures
      return { received: true, processed: false };
    }

    // Parse and handle the webhook
    const payload = this.paymentProvider.parseWebhookPayload(body);
    const result = await this.paymentsService.handlePaymentCallback(payload);

    return { received: true, ...result };
  }

  /**
   * Get transactions for a specific order.
   * GET /api/v1/payments/orders/:orderId/transactions
   */
  @Get('orders/:orderId/transactions')
  async getOrderTransactions(@Param('orderId') orderId: string) {
    const data = await this.paymentsService.getOrderTransactions(orderId);
    return { success: true, data };
  }

  /**
   * List all transactions (admin only).
   * GET /api/v1/payments/transactions
   */
  @Get('transactions')
  @Roles('ADMIN')
  async listTransactions(@Query() query: TransactionQueryDto) {
    const result = await this.paymentsService.listTransactions(query);
    return { success: true, ...result };
  }
}
