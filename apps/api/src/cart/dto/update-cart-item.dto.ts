import { IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt({ message: 'La quantité doit être un nombre entier' })
  @Min(0, { message: 'La quantité minimum est 0' })
  @Max(99, { message: 'La quantité maximum est 99' })
  quantity: number;
}
