import { Controller, Get, Param, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

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
