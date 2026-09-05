import { IsString, IsOptional, MinLength, Matches } from 'class-validator';

export class UpdateSellerProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  businessName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+243\d{9}$/, { message: 'Numéro de téléphone invalide' })
  phone?: string;

  @IsOptional()
  @IsString()
  location?: string;

  // Structured business town (Town Architecture Refactor / D4). The seller
  // picks their town from /v1/cities instead of (or alongside) the free-text
  // `location`. Validated by DB lookup in the service — seeded city ids are
  // non-RFC4122 so `@IsUUID` would wrongly reject them.
  @IsOptional()
  @IsString()
  cityId?: string;

  // Commune of the town above (D4). Resolved by DB lookup in the service:
  // must exist, be active and belong to the (new or current) city — the
  // service derives cityId from it so the pair can never disagree. `null`
  // clears the commune (only allowed when the city has no active commune
  // library); an empty string means "no change", like cityId.
  @IsOptional()
  @IsString()
  communeId?: string | null;

  @IsOptional()
  @IsString()
  description?: string;
}
