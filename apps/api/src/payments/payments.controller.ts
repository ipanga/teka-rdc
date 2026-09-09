import { Controller, Get, Param, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UuidParam } from '../common/pipes/uuid-param.pipe';

@Controller('v1/payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  /**
   * Get transactions for a specific order.
   * GET /api/v1/payments/orders/:orderId/transactions
   *
   * Ownership is enforced server-side: a buyer sees only their own orders, a
   * seller only orders addressed to them, an admin any order. Anything else is
   * a 404 — never a 403 — so the endpoint cannot be used to confirm that an
   * order id exists.
   */
  @Get('orders/:orderId/transactions')
  async getOrderTransactions(
    @CurrentUser() actor: { userId: string; role: string },
    @Param('orderId', UuidParam) orderId: string,
  ) {
    const data = await this.paymentsService.getOrderTransactions(
      orderId,
      actor,
    );
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
