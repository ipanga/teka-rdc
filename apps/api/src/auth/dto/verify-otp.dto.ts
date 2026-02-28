import { IsString, Matches, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+243\d{9}$/, {
    message: 'Numéro de téléphone invalide. Format: +243XXXXXXXXX',
  })
  phone: string;

  @IsString()
  @Length(6, 6, { message: 'Le code doit contenir 6 chiffres' })
  @Matches(/^\d{6}$/, { message: 'Le code doit contenir uniquement des chiffres' })
  code: string;
}
