import {
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateReviewDto {
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'ID produit invalide',
  })
  productId: string;

  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'ID commande invalide',
  })
  orderId: string;

  @IsInt({ message: 'La note doit être un nombre entier' })
  @Min(1, { message: 'La note minimum est 1' })
  @Max(5, { message: 'La note maximum est 5' })
  rating: number;

  /**
   * OPTIONAL during the backward-compatibility window (2026-07-28).
   *
   * Buyer-web and buyer-mobile both REQUIRE a title — the clients validate it
   * before submitting. The server stays permissive so that mobile builds
   * already installed on buyers' phones, which know nothing about this field,
   * can still post a review instead of getting a 400 they cannot fix without
   * updating the app.
   *
   * When absent the review is stored with title = null. The server NEVER
   * invents one: a fabricated title would be put in the buyer's mouth, and it
   * would be indistinguishable from a real one afterwards.
   *
   * Tighten to required only once the updated app has reached sufficient
   * adoption or a forced-update mechanism is live — see
   * docs/review-title-and-editing.md § Rollout.
   *
   * Note this is create-only: UpdateReviewDto still REQUIRES a title, because
   * an edit can only come from a client new enough to offer the field.
   */
  @IsOptional()
  @IsString({ message: 'Le titre doit être une chaîne de caractères' })
  @MinLength(5, { message: 'Le titre doit contenir au moins 5 caractères' })
  @MaxLength(100, { message: 'Le titre ne peut pas dépasser 100 caractères' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'Le texte doit être une chaîne de caractères' })
  @MaxLength(1000, { message: 'Le texte ne peut pas dépasser 1000 caractères' })
  text?: string;
}
