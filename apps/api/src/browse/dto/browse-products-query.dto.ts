import { IsOptional, IsUUID, IsString, MaxLength, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class BrowseProductsQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

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
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
