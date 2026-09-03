import { IsEnum, IsOptional } from 'class-validator';
import { ReportQueryDto } from './report-query.dto';

export const SALES_DIMENSIONS = [
  'product',
  'category',
  'seller',
  'town',
  'day',
] as const;

export type SalesDimension = (typeof SALES_DIMENSIONS)[number];

export class SalesBreakdownQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsEnum(SALES_DIMENSIONS, {
    message: `Dimension invalide. Valeurs acceptées: ${SALES_DIMENSIONS.join(', ')}`,
  })
  by?: SalesDimension = 'day';
}
