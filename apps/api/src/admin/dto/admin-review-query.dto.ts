import {
  IsOptional,
  IsUUID,
  IsString,
  IsInt,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AdminReviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La page doit être un nombre entier' })
  @Min(1, { message: 'La page doit être au minimum 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La limite doit être un nombre entier' })
  @Min(1, { message: 'La limite doit être au minimum 1' })
  @Max(100, { message: 'La limite ne peut pas dépasser 100' })
  limit?: number = 20;

  @IsOptional()
  @IsEnum(['ACTIVE', 'HIDDEN'], {
    message: 'Le statut doit être ACTIVE ou HIDDEN',
  })
  status?: 'ACTIVE' | 'HIDDEN';

  @IsOptional()
  @IsUUID('4', { message: "L'identifiant du produit doit être un UUID valide" })
  productId?: string;

  @IsOptional()
  @IsUUID('4', { message: "L'identifiant de l'acheteur doit être un UUID valide" })
  buyerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La note minimum doit être un nombre entier' })
  @Min(1, { message: 'La note minimum est 1' })
  @Max(5, { message: 'La note maximum est 5' })
  minRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La note maximum doit être un nombre entier' })
  @Min(1, { message: 'La note minimum est 1' })
  @Max(5, { message: 'La note maximum est 5' })
  maxRating?: number;
}
