import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  MinLength,
} from 'class-validator';

export class CreateCityDto {
  @IsString()
  @MinLength(1, { message: 'Le nom est requis' })
  name: string;

  @IsString()
  @MinLength(1, { message: 'La province est requise' })
  province: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  // Data-driven town identity (Town Architecture Refactor). accentColor: accent
  // key ('copper' | 'cobalt' | hex); heroImageUrl: town hero/landing image URL.
  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsString()
  heroImageUrl?: string;
}

export class UpdateCityDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsString()
  heroImageUrl?: string;
}

export class CreateCommuneDto {
  @IsString()
  @MinLength(1, { message: 'Le nom est requis' })
  name: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateCommuneDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
