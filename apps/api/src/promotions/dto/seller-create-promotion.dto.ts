import {
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsString,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { PromotionType } from '@prisma/client';

export class SellerCreatePromotionDto {
  @IsEnum(PromotionType, {
    message: 'Le type doit être PROMOTION ou FLASH_DEAL',
  })
  type: PromotionType;

  @IsString({ message: 'Le titre est requis' })
  @IsNotEmpty({ message: 'Le titre est requis' })
  title: string;

  @IsOptional()
  @IsString({ message: 'La description doit être une chaîne' })
  description?: string;

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

  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'ID produit requis et invalide',
  })
  productId: string;
}
