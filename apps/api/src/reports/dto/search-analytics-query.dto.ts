import { IsEnum, IsIn, IsOptional, Matches } from 'class-validator';
import { ReportQueryDto } from './report-query.dto';

export const SEARCH_BREAKDOWN_DIMENSIONS = [
  'source',
  'intent',
  'town',
  'day',
] as const;

export type SearchBreakdownDimension =
  (typeof SEARCH_BREAKDOWN_DIMENSIONS)[number];

/**
 * Filters for the admin search-analytics endpoints.
 *
 * Extends `ReportQueryDto` to inherit the CAT date window, the 366-day range
 * cap and the pagination bounds rather than re-implementing a second date
 * interpretation. (`sellerId` comes along with it and is simply not meaningful
 * for a search: a search belongs to a buyer and a town, not to a seller. It is
 * accepted and ignored; no client sends it.)
 */
export class SearchAnalyticsQueryDto extends ReportQueryDto {
  /** Town scope. Rows with no town are excluded when this is set. */
  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'ID ville invalide',
  })
  cityId?: string;

  /**
   * Surface filter. `UNKNOWN` is selectable on purpose: it is a real, meaningful
   * cohort (clients predating the `searchSource` parameter), not a bucket to
   * hide. It must never be folded into BUYER_WEB.
   */
  @IsOptional()
  @IsEnum(['BUYER_WEB', 'BUYER_MOBILE', 'UNKNOWN'], {
    message: 'Source invalide. Valeurs acceptées: BUYER_WEB, BUYER_MOBILE, UNKNOWN',
  })
  source?: 'BUYER_WEB' | 'BUYER_MOBILE' | 'UNKNOWN';

  /**
   * Intent filter. Only SUBMIT and SUGGESTION exist in the table — a REFINE
   * re-fetch is never persisted — so there is deliberately no REFINE option.
   */
  @IsOptional()
  @IsEnum(['SUBMIT', 'SUGGESTION'], {
    message: 'Intention invalide. Valeurs acceptées: SUBMIT, SUGGESTION',
  })
  intent?: 'SUBMIT' | 'SUGGESTION';

  /** `true` restricts the listing to searches that returned nothing. */
  @IsOptional()
  @IsIn(['true', 'false'], {
    message: 'zeroResultsOnly doit être "true" ou "false"',
  })
  zeroResultsOnly?: string;
}

export class SearchBreakdownQueryDto extends SearchAnalyticsQueryDto {
  @IsOptional()
  @IsEnum(SEARCH_BREAKDOWN_DIMENSIONS, {
    message: `Dimension invalide. Valeurs acceptées: ${SEARCH_BREAKDOWN_DIMENSIONS.join(', ')}`,
  })
  by?: SearchBreakdownDimension = 'day';
}
