import { IsString, IsNotEmpty, IsOptional, IsBoolean, Matches } from 'class-validator';

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  @IsNotEmpty({ message: 'La province est requise' })
  province: string;

  @IsString()
  @IsNotEmpty({ message: 'La ville est requise' })
  town: string;

  @IsString()
  @IsNotEmpty({ message: 'Le quartier/commune est requis' })
  neighborhood: string;

  @IsOptional()
  @IsString()
  avenue?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+243\d{9}$/, { message: 'Numéro de téléphone invalide. Format: +243XXXXXXXXX' })
  recipientPhone?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
