import {
  IsUUID,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateReviewDto {
  @IsUUID('4', { message: 'ID produit invalide' })
  productId: string;

  @IsUUID('4', { message: 'ID commande invalide' })
  orderId: string;

  @IsInt({ message: 'La note doit être un nombre entier' })
  @Min(1, { message: 'La note minimum est 1' })
  @Max(5, { message: 'La note maximum est 5' })
  rating: number;

  @IsOptional()
  @IsString({ message: 'Le texte doit être une chaîne de caractères' })
  @MaxLength(1000, { message: 'Le texte ne peut pas dépasser 1000 caractères' })
  text?: string;
}
