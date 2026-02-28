import { IsString, IsNotEmpty } from 'class-validator';

export class EstimateFeeQueryDto {
  @IsString({ message: 'La ville d\'origine doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'La ville d\'origine est requise' })
  fromTown: string;

  @IsString({ message: 'La ville de destination doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'La ville de destination est requise' })
  toTown: string;
}
