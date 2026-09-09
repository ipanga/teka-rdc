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
  email?: string;
}

// `avatar` is deliberately NOT accepted here (D11, 2026-09-06). The only
// writer is POST /v1/users/avatar, which uploads the asset itself: a client
// must not be able to store an arbitrary URL as its avatar — the replace path
// derives the previous asset to destroy from the stored URL, and no client
// (buyer-web, seller-web, buyer-mobile, seller-mobile) ever sent this field.
