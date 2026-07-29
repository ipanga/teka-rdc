import {
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Payload for editing one's own review (PATCH /v1/reviews/:id).
 *
 * Deliberately NOT a PartialType(CreateReviewDto): productId and orderId are
 * fixed at creation and must never be re-assignable — letting a client move a
 * review to another product or order would bypass the delivered-purchase
 * eligibility check.
 *
 * `title` is required on edit, matching create: an edited review is held to the
 * same standard as a new one. The column stays nullable only so legacy reviews
 * keep rendering.
 */
export class UpdateReviewDto {
  @IsInt({ message: 'La note doit être un nombre entier' })
  @Min(1, { message: 'La note minimum est 1' })
  @Max(5, { message: 'La note maximum est 5' })
  rating: number;

  @IsString({ message: 'Le titre doit être une chaîne de caractères' })
  @MinLength(5, { message: 'Le titre doit contenir au moins 5 caractères' })
  @MaxLength(100, { message: 'Le titre ne peut pas dépasser 100 caractères' })
  title: string;

  @IsOptional()
  @IsString({ message: 'Le texte doit être une chaîne de caractères' })
  @MaxLength(1000, { message: 'Le texte ne peut pas dépasser 1000 caractères' })
  text?: string;
}
