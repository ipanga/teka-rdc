import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SearchAnalyticsService } from './search-analytics.service';
import {
  SearchAnalyticsQueryDto,
  SearchBreakdownQueryDto,
} from './dto/search-analytics-query.dto';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * Admin search analytics — what buyers are looking for, and what Teka is not
 * answering.
 *
 * Read-only. Sits under the existing `v1/admin/reports` namespace beside the
 * order ledger and the sales analytics, in its own controller because it
 * answers a different question from either.
 *
 * `@Roles('ADMIN')` is enforced by the globally-registered JwtAuthGuard ->
 * RolesGuard chain, so a buyer or seller gets 403 and an anonymous caller 401
 * — on the CSV route too.
 */
@Controller('v1/admin/reports/search')
@Roles('ADMIN')
export class SearchAnalyticsController {
  constructor(private searchAnalytics: SearchAnalyticsService) {}

  /** Term listing — the main table. Paginated; honours every filter. */
  @Get()
  async getTerms(@Query() query: SearchAnalyticsQueryDto) {
    const data = await this.searchAnalytics.getTerms(query);
    return { success: true, data };
  }

  /** Headline metrics. `totalSearches` is the denominator for every rate. */
  @Get('summary')
  async getSummary(@Query() query: SearchAnalyticsQueryDto) {
    const data = await this.searchAnalytics.getSummary(query);
    return { success: true, data };
  }

  /** Recent half of the window vs the half before it, ranked by absolute delta. */
  @Get('trending')
  async getTrending(@Query() query: SearchAnalyticsQueryDto) {
    const data = await this.searchAnalytics.getTrending(query);
    return { success: true, data };
  }

  /** Splits by source | intent | town | day. */
  @Get('breakdown')
  async getBreakdown(@Query() query: SearchBreakdownQueryDto) {
    const data = await this.searchAnalytics.getBreakdown(query);
    return { success: true, data };
  }

  /** Raw events matching the active filters, as CSV. */
  @Get('csv')
  async getCsv(
    @Query() query: SearchAnalyticsQueryDto,
    @Res() res: Response,
  ) {
    await this.searchAnalytics.generateCsv(query, res);
  }
}
