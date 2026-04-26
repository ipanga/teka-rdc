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
