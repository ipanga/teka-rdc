import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
Matches, } from 'class-validator';

export class CreateDeliveryZoneDto {
  @IsString({
    message: "La ville d'origine doit être une chaîne de caractères",
  })
  @IsNotEmpty({ message: "La ville d'origine est requise" })
  fromTown: string;

  @IsString({
    message: 'La ville de destination doit être une chaîne de caractères',
  })
  @IsNotEmpty({ message: 'La ville de destination est requise' })
  toTown: string;

  @IsString({
    message:
      'Les frais en CDF doivent être une chaîne de caractères (nombre entier)',
  })
  @IsNotEmpty({ message: 'Les frais en CDF sont requis' })
  @Matches(/^\d+$/, {
    message: 'Les frais en CDF doivent contenir uniquement des chiffres',
  })
  feeCDF: string;

  @IsOptional()
  @IsString({
    message:
      'Les frais en USD doivent être une chaîne de caractères (nombre entier)',
  })
  @Matches(/^\d+$/, {
    message: 'Les frais en USD doivent contenir uniquement des chiffres',
  })
  feeUSD?: string;

  @IsOptional()
  @IsBoolean({ message: 'Le champ actif doit être un booléen' })
  isActive?: boolean;
}
