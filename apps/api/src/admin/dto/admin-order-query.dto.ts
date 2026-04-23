import { IsOptional, IsString, Matches, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminOrderQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: 'La page doit être au minimum 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: 'La limite doit être au minimum 1' })
  @Max(100, { message: 'La limite ne peut pas dépasser 100' })
  limit?: number = 20;

  @IsOptional()
  @IsString({ message: 'Le statut doit être une chaîne de caractères' })
  status?: string;

  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: "L'identifiant du vendeur doit être un UUID valide",
  })
  sellerId?: string;

  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: "L'identifiant de l'acheteur doit être un UUID valide",
  })
  buyerId?: string;

  @IsOptional()
  @IsString({ message: 'La date de début doit être une chaîne de caractères' })
  dateFrom?: string;

  @IsOptional()
  @IsString({ message: 'La date de fin doit être une chaîne de caractères' })
  dateTo?: string;
}
