import { IsOptional, IsDateString, Matches, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { IsValidDateRange } from '../../common/validators/date-range.validator';

/** Hard ceiling on a single JSON page. CSV exports use CSV_MAX_ROWS instead. */
export const REPORT_MAX_LIMIT = 200;
export const REPORT_DEFAULT_LIMIT = 50;

/** Widest range a single report may span (a leap year, inclusive). */
export const REPORT_MAX_RANGE_DAYS = 366;

/**
 * Shared query shape for every `/v1/admin/reports/*` endpoint.
 *
 * Note `main.ts` runs `ValidationPipe({ forbidNonWhitelisted: true })`, so a
 * parameter that is not declared here is rejected with a 400 rather than
 * silently dropped. Any new client-side filter must land in this DTO in a
 * deploy that PRECEDES the client sending it.
 */
@IsValidDateRange({ maxDays: REPORT_MAX_RANGE_DAYS })
export class ReportQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'La date de début doit être au format ISO' })
  dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La date de fin doit être au format ISO' })
  dateTo?: string;

  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'ID vendeur invalide',
  })
  sellerId?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: 'La page doit être au minimum 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: 'La limite doit être au minimum 1' })
  @Max(REPORT_MAX_LIMIT, {
    message: `La limite ne peut pas dépasser ${REPORT_MAX_LIMIT}`,
  })
  limit?: number = REPORT_DEFAULT_LIMIT;
}
