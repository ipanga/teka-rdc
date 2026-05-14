import { IsString, Matches } from 'class-validator';

export class BuyerMigrateCheckDto {
  @IsString()
  @Matches(/^\+243\d{9}$/, { message: 'Numéro de téléphone invalide' })
  phone: string;
}
