import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { SalesAnalyticsService } from './sales-analytics.service';
import { SalesAnalyticsController } from './sales-analytics.controller';
import { SearchAnalyticsService } from './search-analytics.service';
import { SearchAnalyticsController } from './search-analytics.controller';

@Module({
  imports: [PrismaModule],
  // ReportsController first: its static `sales` / `sales/csv` routes and the
  // analytics controller's `sales/summary` / `sales/breakdown` are distinct
  // literal paths with no wildcards, so ordering is not load-bearing — but the
  // ledger stays declared first to match how the URL space reads.
  controllers: [
    ReportsController,
    SalesAnalyticsController,
    SearchAnalyticsController,
  ],
  providers: [ReportsService, SalesAnalyticsService, SearchAnalyticsService],
  exports: [ReportsService, SalesAnalyticsService, SearchAnalyticsService],
})
export class ReportsModule {}
