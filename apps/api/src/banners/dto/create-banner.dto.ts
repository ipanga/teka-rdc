import {
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsEnum,
  IsNumber,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BannerStatus } from '@prisma/client';
import { TranslatableTextDto } from './translatable-text.dto';

export class CreateBannerDto {
  @IsObject({ message: 'Le titre doit être un objet avec les traductions' })
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  title: TranslatableTextDto;

  @IsOptional()
  @IsObject({
    message: 'Le sous-titre doit être un objet avec les traductions',
  })
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  subtitle?: TranslatableTextDto;

  @IsUrl({}, { message: "L'URL de l'image doit être une URL valide" })
  imageUrl: string;

  @IsOptional()
  @IsString({ message: "L'URL du lien doit être une chaîne de caractères" })
  linkUrl?: string;

  @IsOptional()
  @IsEnum(['product', 'category', 'promotion', 'url'], {
    message: 'Le type de lien doit être product, category, promotion ou url',
  })
  linkType?: string;

  @IsOptional()
  @IsString({ message: 'La cible du lien doit être une chaîne de caractères' })
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
