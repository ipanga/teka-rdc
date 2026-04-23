import { IsEmail, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class EmailLoginDto {
  @IsEmail({}, { message: 'Adresse email invalide' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email: string;

  @IsString()
  @MinLength(1, { message: 'Mot de passe requis' })
  password: string;
}
