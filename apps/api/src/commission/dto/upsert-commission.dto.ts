import {
  IsBoolean,
  IsNumber,
  IsOptional,
  Max,
  Min,
  Matches,
  ValidateIf,
} from 'class-validator';

export class UpsertCommissionDto {
  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: "L'ID de catégorie est invalide",
  })
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

  /**
   * Optimistic concurrency: the rate the operator saw (null = "no setting
   * yet"). When present and different from the stored value → 409.
   */
  @IsOptional()
  @ValidateIf((o) => o.expectedPreviousRate !== null)
  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'Le taux précédent attendu doit être un nombre avec au maximum 4 décimales' },
  )
  @Min(0, { message: 'Le taux précédent attendu est invalide' })
  @Max(1, { message: 'Le taux précédent attendu est invalide' })
  expectedPreviousRate?: number | null;
}
