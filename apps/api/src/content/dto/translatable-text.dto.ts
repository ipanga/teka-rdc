import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class TranslatableTextDto {
  @IsString({ message: 'Le texte en français doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le texte en français est obligatoire' })
  fr: string;

  @IsOptional()
  @IsString({ message: 'Le texte en anglais doit être une chaîne de caractères' })
  en?: string;
}
