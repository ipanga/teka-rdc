import { IsOptional, Matches } from 'class-validator';

/**
 * Optional town scope for the category endpoints (SEO-2). With `cityId`,
 * `productCount` counts the products that are publicly eligible IN THAT TOWN
 * (see BrowseService.publicProductWhere) instead of the global figure, so the
 * buyer-web route and sitemap can decide indexability from town inventory.
 * Same shape check as the products query — seeded ids are non-RFC4122, so
 * the value is validated by shape and resolved by the DB, never `@IsUUID`.
 */
export class BrowseCategoriesQueryDto {
  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  cityId?: string;
}
