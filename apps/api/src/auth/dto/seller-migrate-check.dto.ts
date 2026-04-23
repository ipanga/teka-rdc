import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';

export class SellerMigrateCheckDto {
  @IsEmail({}, { message: 'Adresse email invalide' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;
}
