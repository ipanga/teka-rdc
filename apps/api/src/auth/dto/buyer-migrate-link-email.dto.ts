import { IsEmail, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class BuyerMigrateLinkEmailDto {
  @IsString()
  @Matches(/^\+243\d{9}$/, { message: 'Numéro de téléphone invalide' })
  phone: string;

  @IsEmail({}, { message: 'Adresse email invalide' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;
}
