import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  MinLength,
  MaxLength,
  ArrayUnique,
} from 'class-validator';

// NOTE: ids are NOT validated with @IsUUID / ParseUUIDPipe. Seeded categories
// and brands use deterministic, non-RFC4122 ids (e.g. 13000000-…/15000000-…)
// that fail isUUID(). Existence is validated in BrandsService via DB lookup.

export class CreateBrandDto {
  @IsString()
  @MinLength(1, { message: 'Le nom de la marque est requis' })
  @MaxLength(80, { message: 'Le nom ne peut pas dépasser 80 caractères' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  /** Subcategory ids this brand is offered in. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  categoryIds?: string[];
}

export class UpdateBrandDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  categoryIds?: string[];
}

export class MergeBrandDto {
  /** The brand that absorbs the source brand's products + category links. */
  @IsString()
  @MinLength(1)
  targetBrandId: string;
}

export class SetBrandCategoriesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  categoryIds: string[];
}
