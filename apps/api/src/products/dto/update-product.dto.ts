import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  /**
   * OPTIONAL optimistic-concurrency snapshot for the absolute `quantity` edit:
   * the stock the seller's form was loaded with. The edit is applied only if
   * the stored stock still equals it (409 otherwise), so a sale or a
   * cancellation restock that landed while the form was open is never
   * silently overwritten. `quantity === expectedQuantity` means "stock not
   * edited" and writes nothing. Installed clients that omit it keep working
   * (guarded only from the server's own read to its write).
   * Same integer rules as `quantity`.
   */
  @IsOptional()
  @IsInt({ message: 'La quantité attendue doit être un nombre entier' })
  @Min(0, { message: 'La quantité attendue ne peut pas être négative' })
  @Type(() => Number)
  expectedQuantity?: number;
}
