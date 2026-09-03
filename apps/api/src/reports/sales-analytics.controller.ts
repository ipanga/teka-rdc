import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SalesAnalyticsService } from './sales-analytics.service';
import { SalesBreakdownQueryDto } from './dto/sales-breakdown-query.dto';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * Admin sales analytics.
 *
 * Sits under the existing `v1/admin/reports` namespace but in its own
 * controller: `ReportsController` serves order-level LEDGERS (every order, on
 * `createdAt`, whatever its status), while these routes answer "what sold" —
 * delivered orders only, on `deliveredAt`. Two different questions, kept
 * apart so neither definition quietly becomes the other.
 *
 * `@Roles('ADMIN')` is enforced by the globally-registered JwtAuthGuard ->
 * RolesGuard chain (app.module.ts), so buyers and sellers get 403 and an
 * anonymous caller 401 — on the CSV route too.
 */
@Controller('v1/admin/reports/sales')
@Roles('ADMIN')
export class SalesAnalyticsController {
  constructor(private salesAnalytics: SalesAnalyticsService) {}

  /** Headline totals, plus the counters that stop them being misread. */
  @Get('summary')
  async getSummary(@Query() query: SalesBreakdownQueryDto) {
    const data = await this.salesAnalytics.getSummary(query);
    return { success: true, data };
  }

  /** One dimension of the breakdown: product | category | seller | town | day. */
  @Get('breakdown')
  async getBreakdown(@Query() query: SalesBreakdownQueryDto) {
    const data = await this.salesAnalytics.getBreakdown(query);
    return { success: true, data };
  }

  @Get('breakdown/csv')
  async getBreakdownCsv(
    @Query() query: SalesBreakdownQueryDto,
    @Res() res: Response,
  ) {
    await this.salesAnalytics.generateBreakdownCsv(query, res);
  }
}
