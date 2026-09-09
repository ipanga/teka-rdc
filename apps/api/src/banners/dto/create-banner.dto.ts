import {
  IsOptional,
  IsString,
  IsUrl,
  IsEnum,
  IsNumber,
  IsDateString,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { BannerStatus } from '@prisma/client';
import { IsSafeBannerLink } from '../banner-link.validator';

export class CreateBannerDto {
  @IsString({ message: 'Le titre doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le titre est obligatoire' })
  @MaxLength(150, { message: 'Le titre ne peut pas dépasser 150 caractères' })
  title: string;

  @IsOptional()
  @IsString({ message: 'Le sous-titre doit être une chaîne de caractères' })
  @MaxLength(300, { message: 'Le sous-titre ne peut pas dépasser 300 caractères' })
  subtitle?: string;

  @IsUrl({}, { message: "L'URL de l'image doit être une URL valide" })
  imageUrl: string;

  // S22: admin-authored and rendered as a real anchor on the storefront —
  // validated against `linkType`, never stored raw.
  @IsOptional()
  @IsString({ message: "L'URL du lien doit être une chaîne de caractères" })
  @IsSafeBannerLink()
  linkUrl?: string;

  @IsOptional()
  @IsEnum(['product', 'category', 'promotion', 'url'], {
    message: 'Le type de lien doit être product, category, promotion ou url',
  })
  linkType?: string;

  @IsOptional()
  @IsString({ message: 'La cible du lien doit être une chaîne de caractères' })
  @IsSafeBannerLink()
  linkTarget?: string;

  @IsOptional()
  @IsEnum(BannerStatus, {
    message: `Le statut doit être l'un de: ${Object.values(BannerStatus).join(', ')}`,
  })
  status?: BannerStatus;

  @IsOptional()
  @IsNumber({}, { message: "L'ordre de tri doit être un nombre" })
  sortOrder?: number;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'La date de début doit être une date ISO valide' },
  )
  startsAt?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La date de fin doit être une date ISO valide' })
  endsAt?: string;
}
