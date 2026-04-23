import {
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  Max,
  ArrayMinSize,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

class MergeCartItemDto {
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'ID produit invalide',
  })
  productId: string;

  @Type(() => Number)
  @IsInt({ message: 'La quantité doit être un nombre entier' })
  @Min(1, { message: 'La quantité minimum est 1' })
  @Max(99, { message: 'La quantité maximum est 99' })
  quantity: number;
}

export class MergeCartDto {
  @IsArray({ message: 'Les articles doivent être un tableau' })
  @ArrayMinSize(1, { message: 'Le panier doit contenir au moins un article' })
  @ValidateNested({ each: true })
  @Type(() => MergeCartItemDto)
  items: MergeCartItemDto[];
}
