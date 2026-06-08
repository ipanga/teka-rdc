import {
  IsOptional,
  Matches,
  IsString,
  MaxLength,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BrowseProductsQueryDto {
  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  categoryId?: string;

  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  cityId?: string;

  @IsOptional()
  @IsString()
  minPrice?: string;

  @IsOptional()
  @IsString()
  maxPrice?: string;

  @IsOptional()
  @IsEnum(['NEW', 'USED'])
  condition?: 'NEW' | 'USED';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /**
   * Attribute (facet) filter, as a URL-encoded JSON object mapping an
   * attribute id to the selected option values:
   * `{"<attributeId>":["Samsung","Apple"],"<attributeId2>":["64Go"]}`.
   * Semantics: AND across attributes, OR within an attribute. Only SELECT /
   * MULTISELECT attributes are filterable. Parsed + structurally validated
   * leniently in the service (malformed → ignored), so this is just a bounded
   * string at the DTO layer.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  attributes?: string;

  @IsOptional()
  @IsEnum(['popularity', 'price_low', 'price_high', 'newest', 'rating'])
  sortBy?: 'popularity' | 'price_low' | 'price_high' | 'newest' | 'rating';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
