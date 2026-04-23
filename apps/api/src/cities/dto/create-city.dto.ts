import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  ValidateNested,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

class TranslatableTextDto {
  @IsString()
  @MinLength(1, { message: 'Le nom en français est requis' })
  fr: string;

  @IsOptional()
  @IsString()
  en?: string;
}

export class CreateCityDto {
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  name: TranslatableTextDto;

  @IsString()
  @MinLength(1, { message: 'La province est requise' })
  province: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateCityDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  name?: TranslatableTextDto;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class CreateCommuneDto {
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  name: TranslatableTextDto;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateCommuneDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  name?: TranslatableTextDto;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
