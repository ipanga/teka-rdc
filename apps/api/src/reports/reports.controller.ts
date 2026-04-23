import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/reports')
@Roles('ADMIN')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  /**
   * GET /api/v1/admin/reports/sales
   * Admin: sales report (JSON).
   */
  @Get('sales')
  async getSalesReport(@Query() query: ReportQueryDto) {
    const data = await this.reportsService.getSalesReport(query);
    return { success: true, data };
  }

  /**
   * GET /api/v1/admin/reports/sales/csv
   * Admin: sales report (CSV download).
   */
  @Get('sales/csv')
  async getSalesCsv(@Query() query: ReportQueryDto, @Res() res: Response) {
    await this.reportsService.generateSalesCsv(query, res);
  }

  /**
   * GET /api/v1/admin/reports/financial
   * Admin: financial report (JSON).
   */
  @Get('financial')
  async getFinancialReport(@Query() query: ReportQueryDto) {
    const data = await this.reportsService.getFinancialReport(query);
    return { success: true, data };
  }

  /**
   * GET /api/v1/admin/reports/financial/csv
   * Admin: financial report (CSV download).
   */
  @Get('financial/csv')
  async getFinancialCsv(@Query() query: ReportQueryDto, @Res() res: Response) {
    await this.reportsService.generateFinancialCsv(query, res);
  }

  /**
   * GET /api/v1/admin/reports/sellers
   * Admin: seller performance report (JSON).
   */
  @Get('sellers')
  async getSellerPerformanceReport(@Query() query: ReportQueryDto) {
    const data = await this.reportsService.getSellerPerformanceReport(query);
    return { success: true, data };
  }

  /**
   * GET /api/v1/admin/reports/sellers/csv
   * Admin: seller performance report (CSV download).
   */
  @Get('sellers/csv')
  async getSellerPerformanceCsv(
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    await this.reportsService.generateSellerPerformanceCsv(query, res);
  }
}
