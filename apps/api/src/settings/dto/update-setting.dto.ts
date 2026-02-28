import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateSettingDto {
  @IsString({ message: 'La valeur doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'La valeur est obligatoire' })
  value: string;
}
