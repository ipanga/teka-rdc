import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  status?: string;

  // Free-text search over the seller's own products: title (partial,
  // case-insensitive), shortCode, or full product id.
  @IsOptional()
  @IsString()
  search?: string;
}
