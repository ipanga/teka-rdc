import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from '@prisma/client';

/**
 * S14 (2026-09-09): `page` and `limit` were `@Type(() => Number)` only, so a
 * seller could ask for `limit=1000000` and pull their whole catalogue with
 * images in one query, and `status` was a free string cast into a Prisma enum
 * filter, which answers a 500 rather than a 400. Bounds match
 * `PayoutQueryDto`, the convention already used elsewhere.
 */
export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La page doit être un nombre entier' })
  @Min(1, { message: 'La page doit être au minimum 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La limite doit être un nombre entier' })
  @Min(1, { message: 'La limite doit être au minimum 1' })
  @Max(100, { message: 'La limite ne peut pas dépasser 100' })
  limit?: number = 20;

  @IsOptional()
  @IsIn(Object.values(ProductStatus), {
    message: `Le statut doit être l'un des suivants : ${Object.values(ProductStatus).join(', ')}`,
  })
  status?: string;

  // Free-text search over the seller's own products: title (partial,
  // case-insensitive), shortCode, or full product id.
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'La recherche ne peut pas dépasser 200 caractères' })
  search?: string;
}
