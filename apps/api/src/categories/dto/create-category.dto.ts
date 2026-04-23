import {
  IsObject,
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  MaxLength,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TranslatableTextDto } from './translatable-text.dto';

export class CreateCategoryDto {
  @IsObject({ message: 'Le nom doit être un objet avec les traductions' })
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  name: TranslatableTextDto;

  @IsOptional()
  @IsObject({
    message: 'La description doit être un objet avec les traductions',
  })
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  description?: TranslatableTextDto;

  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: "L'identifiant de la catégorie parente doit être un UUID valide",
  })
  parentCategoryId?: string;

  @IsOptional()
  @IsString({ message: "L'emoji doit être une chaîne de caractères" })
  @MaxLength(4, { message: "L'emoji ne peut pas dépasser 4 caractères" })
  emoji?: string;

  @IsOptional()
  @IsNumber({}, { message: "L'ordre de tri doit être un nombre" })
  sortOrder?: number;

  @IsOptional()
  @IsBoolean({ message: 'Le champ actif doit être un booléen' })
  isActive?: boolean;
}
