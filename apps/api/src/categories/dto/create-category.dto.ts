import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsNotEmpty,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le nom est obligatoire' })
  name: string;

  @IsOptional()
  @IsString({ message: 'La description doit être une chaîne de caractères' })
  description?: string;

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
