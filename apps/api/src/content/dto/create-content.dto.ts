import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { ContentPageStatus } from '@prisma/client';

export class CreateContentDto {
  @IsString({ message: 'Le slug doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le slug est obligatoire' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Le slug ne peut contenir que des lettres minuscules, chiffres et tirets',
  })
  slug: string;

  @IsString({ message: 'Le titre doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le titre est obligatoire' })
  title: string;

  @IsString({ message: 'Le contenu doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le contenu est obligatoire' })
  content: string;

  @IsOptional()
  @IsEnum(ContentPageStatus, {
    message: `Le statut doit être l'un de: ${Object.values(ContentPageStatus).join(', ')}`,
  })
  status?: ContentPageStatus;

  @IsOptional()
  @IsNumber({}, { message: "L'ordre de tri doit être un nombre" })
  sortOrder?: number;
}
