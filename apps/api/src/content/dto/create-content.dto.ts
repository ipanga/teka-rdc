import {
  IsObject,
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsNotEmpty,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContentPageStatus } from '@prisma/client';
import { TranslatableTextDto } from './translatable-text.dto';

export class CreateContentDto {
  @IsString({ message: 'Le slug doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le slug est obligatoire' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Le slug ne peut contenir que des lettres minuscules, chiffres et tirets',
  })
  slug: string;

  @IsObject({ message: 'Le titre doit être un objet avec les traductions' })
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  title: TranslatableTextDto;

  @IsObject({ message: 'Le contenu doit être un objet avec les traductions' })
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  content: TranslatableTextDto;

  @IsOptional()
  @IsEnum(ContentPageStatus, {
    message: `Le statut doit être l'un de: ${Object.values(ContentPageStatus).join(', ')}`,
  })
  status?: ContentPageStatus;

  @IsOptional()
  @IsNumber({}, { message: "L'ordre de tri doit être un nombre" })
  sortOrder?: number;
}
