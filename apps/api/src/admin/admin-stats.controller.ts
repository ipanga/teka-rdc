import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { AdminStatsService } from './admin-stats.service';
import type { TrendPeriod } from './admin-stats.service';
import { Roles } from '../common/decorators/roles.decorator';

const VALID_PERIODS: TrendPeriod[] = ['7d', '30d', '90d'];

@Controller('v1/admin/stats')
@Roles('ADMIN')
export class AdminStatsController {
  constructor(private adminStatsService: AdminStatsService) {}

  @Get()
  getDashboardStats() {
    return this.adminStatsService.getDashboardStats();
  }

  @Get('trends')
  getDashboardTrends(@Query('period') period?: string) {
    const resolvedPeriod = (period || '30d') as TrendPeriod;

    if (!VALID_PERIODS.includes(resolvedPeriod)) {
      throw new BadRequestException(
        `Période invalide. Valeurs acceptées: ${VALID_PERIODS.join(', ')}`,
      );
    }

    return this.adminStatsService.getDashboardTrends(resolvedPeriod);
  }
}
