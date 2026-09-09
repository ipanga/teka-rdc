import {
  IsString,
  IsOptional,
  IsEmail,
  MinLength,
  MaxLength,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Le prénom doit contenir au moins 2 caractères' })
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères' })
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Adresse email invalide' })
  @MaxLength(160, { message: "L'adresse email ne peut pas dépasser 160 caractères" })
  email?: string;

  /**
   * Required only when `email` actually differs from the current login
   * address (see UsersService.updateProfile). Optional at the DTO level so a
   * client re-sending the unchanged profile stays a password-free no-op.
   * Verified against the stored hash; never logged, stored or returned.
   */
  @IsOptional()
  @IsString({ message: 'Mot de passe invalide.' })
  @MaxLength(72, { message: 'Mot de passe invalide.' })
  password?: string;
}

// `avatar` is deliberately NOT accepted here (D11, 2026-09-06). The only
// writer is POST /v1/users/avatar, which uploads the asset itself: a client
// must not be able to store an arbitrary URL as its avatar — the replace path
// derives the previous asset to destroy from the stored URL, and no client
// (buyer-web, seller-web, buyer-mobile, seller-mobile) ever sent this field.
