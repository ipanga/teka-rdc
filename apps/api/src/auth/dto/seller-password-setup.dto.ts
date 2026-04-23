import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SellerPasswordSetupDto {
  @IsString()
  @MinLength(1, { message: 'Token requis' })
  token: string;

  @IsString()
  @MinLength(8, {
    message: 'Le mot de passe doit contenir au moins 8 caractères',
  })
  @MaxLength(72, { message: 'Le mot de passe ne peut dépasser 72 caractères' })
  @Matches(/[A-Za-z]/, {
    message: 'Le mot de passe doit contenir au moins une lettre',
  })
  @Matches(/\d/, {
    message: 'Le mot de passe doit contenir au moins un chiffre',
  })
  password: string;
}
