import {
  IsObject,
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsIn,
  IsArray,
  ValidateNested,
  IsNotEmpty,
Matches, } from 'class-validator';
import { Type } from 'class-transformer';

class TranslatableTextDto {
  @IsString()
  @IsNotEmpty({ message: 'Le texte en français est requis' })
  fr: string;

  @IsOptional()
  @IsString()
  en?: string;
}

class SpecificationDto {
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, { message: 'Attribut invalide' })
  attributeId: string;

  @IsString()
  @IsNotEmpty({ message: 'La valeur est requise' })
  value: string;
}

export class CreateProductDto {
  @IsObject()
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  title: TranslatableTextDto;

  @IsObject()
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  description: TranslatableTextDto;

  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, { message: 'Catégorie invalide' })
  categoryId: string;

  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, { message: 'Ville invalide' })
  cityId?: string;

  @IsString({ message: 'Le prix CDF est requis' })
  priceCDF: string; // BigInt as string

  @IsOptional()
  @IsString()
  priceUSD?: string;

  @IsInt()
  @Min(0, { message: 'La quantité ne peut pas être négative' })
  @Type(() => Number)
  quantity: number;

  @IsIn(['NEW', 'USED'], { message: 'Condition invalide' })
  condition: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecificationDto)
  specifications?: SpecificationDto[];
}
