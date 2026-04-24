import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Public contact-form payload. The honeypot field `website` is declared but
 * intentionally untyped/undocumented — any non-empty value is treated as a
 * bot and silently dropped server-side (still 200 so bots can't probe).
 */
export class CreateContactDto {
  @IsString()
  @MinLength(2, { message: 'Votre nom est requis' })
  @MaxLength(80)
  name: string;

  @IsEmail({}, { message: 'Adresse email invalide' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsOptional()
  @IsString()
  @Matches(/^[\d+()\s-]{6,20}$/, {
    message: 'Numéro de téléphone invalide',
  })
  phone?: string;

  @IsString()
  @MinLength(3, { message: 'Le sujet est requis' })
  @MaxLength(120)
  subject: string;

  @IsString()
  @MinLength(10, {
    message: 'Le message doit contenir au moins 10 caractères',
  })
  @MaxLength(2000)
  message: string;

  /** Honeypot — real users never fill this. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  website?: string;
}
