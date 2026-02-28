import { IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class AddToCartDto {
  @IsUUID('4', { message: 'ID produit invalide' })
  productId: string;

  @Type(() => Number)
  @IsInt({ message: 'La quantité doit être un nombre entier' })
  @Min(1, { message: 'La quantité minimum est 1' })
  @Max(99, { message: 'La quantité maximum est 99' })
  quantity: number;
}
