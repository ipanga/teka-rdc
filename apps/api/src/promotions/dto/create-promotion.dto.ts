import {
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsUUID,
  IsObject,
  IsString,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PromotionType } from '@prisma/client';

class TranslatableTextDto {
  @IsString({ message: 'Le titre en français est requis' })
  fr: string;

  @IsOptional()
  @IsString({ message: 'Le titre en anglais doit être une chaîne' })
  en?: string;
}

export class CreatePromotionDto {
  @IsEnum(PromotionType, {
    message: 'Le type doit être PROMOTION ou FLASH_DEAL',
  })
  type: PromotionType;

  @IsObject({ message: 'Le titre doit être un objet { fr, en? }' })
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  title: TranslatableTextDto;

  @IsOptional()
  @IsObject({ message: 'La description doit être un objet { fr, en? }' })
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  description?: TranslatableTextDto;

  @IsOptional()
  @IsInt({ message: 'Le pourcentage de réduction doit être un entier' })
  @Min(1, { message: 'Le pourcentage minimum est 1' })
  @Max(99, { message: 'Le pourcentage maximum est 99' })
  discountPercent?: number;

  @IsOptional()
  @IsInt({ message: 'La réduction en CDF doit être un entier positif' })
  @Min(1, { message: 'La réduction en CDF doit être au minimum 1' })
  discountCDF?: number;

  @IsDateString({}, { message: 'La date de début doit être au format ISO' })
  startsAt: string;

  @IsDateString({}, { message: 'La date de fin doit être au format ISO' })
  endsAt: string;

  @IsOptional()
  @IsUUID('4', { message: 'ID produit invalide' })
  productId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'ID catégorie invalide' })
  categoryId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'ID vendeur invalide' })
  sellerId?: string;
}
