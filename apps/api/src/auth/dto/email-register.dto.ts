import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class EmailRegisterDto {
  @IsEmail({}, { message: 'Adresse email invalide' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

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

  @IsString()
  @MinLength(2, { message: 'Le prénom doit contenir au moins 2 caractères' })
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères' })
  @MaxLength(50)
  lastName: string;
}
