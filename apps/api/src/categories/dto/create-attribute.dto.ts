import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsIn,
  IsArray,
  IsNotEmpty,
} from 'class-validator';

export class CreateAttributeDto {
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le nom est obligatoire' })
  name: string;

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
