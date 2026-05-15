import { IsString, Matches, MinLength } from 'class-validator';

export class BuyerClaimVerifyDto {
  @IsString()
  @MinLength(1, { message: 'Token requis' })
  token: string;

  @IsString()
  @Matches(/^\+243\d{9}$/, { message: 'Numéro de téléphone invalide' })
  phone: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code à 6 chiffres requis' })
  code: string;
}
