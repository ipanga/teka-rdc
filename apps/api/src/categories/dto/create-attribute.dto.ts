import {
  IsObject,
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsIn,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TranslatableTextDto } from './translatable-text.dto';

export class CreateAttributeDto {
  @IsObject({ message: 'Le nom doit être un objet avec les traductions' })
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  name: TranslatableTextDto;

  @IsString({ message: 'Le type doit être une chaîne de caractères' })
  @IsIn(['TEXT', 'SELECT', 'MULTISELECT', 'NUMERIC'], {
    message: 'Le type doit être TEXT, SELECT, MULTISELECT ou NUMERIC',
  })
  type: string;

  @IsOptional()
  @IsArray({ message: 'Les options doivent être un tableau' })
  @IsString({
    each: true,
    message: 'Chaque option doit être une chaîne de caractères',
  })
  options?: string[];

  @IsOptional()
  @IsBoolean({ message: 'Le champ obligatoire doit être un booléen' })
  isRequired?: boolean;

  @IsOptional()
  @IsNumber({}, { message: "L'ordre de tri doit être un nombre" })
  sortOrder?: number;
}
