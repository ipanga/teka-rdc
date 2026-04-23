import {
  IsBoolean,
  IsNumber,
  IsOptional,
  Max,
  Min,
Matches, } from 'class-validator';

export class UpsertCommissionDto {
  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, { message: 'L\'ID de catégorie est invalide' })
  categoryId?: string | null;

  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'Le taux doit être un nombre avec au maximum 4 décimales' },
  )
  @Min(0, { message: 'Le taux ne peut pas être négatif' })
  @Max(1, { message: 'Le taux ne peut pas dépasser 1 (100%)' })
  rate: number;

  @IsOptional()
  @IsBoolean({ message: 'isActive doit être un booléen' })
  isActive?: boolean;
}
