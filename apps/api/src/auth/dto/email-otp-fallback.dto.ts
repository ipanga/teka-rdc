import { IsString, Matches } from 'class-validator';

export class EmailOtpFallbackDto {
  @IsString()
  @Matches(/^\+243\d{9}$/, {
    message: 'Numéro de téléphone invalide. Format: +243XXXXXXXXX',
  })
  phone: string;
}
