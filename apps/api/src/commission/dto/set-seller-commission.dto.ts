import { IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';

/**
 * Admin sets a seller-specific commission override. Same domain as the
 * platform / category settings: a fraction in [0, 1] with at most 4 decimals
 * (Decimal(5,4) → 0.01 % precision). `0` is a legitimate 0 % override; "use
 * the default" is expressed by DELETE, never by a sentinel value.
 *
 * `expectedPreviousRate` is optimistic concurrency: the rate the operator saw
 * (null = "no override"). When present and different from the stored value,
 * the API answers 409 instead of silently overwriting another admin's change.
 */
export class SetSellerCommissionDto {
  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'Le taux doit être un nombre avec au maximum 4 décimales' },
  )
  @Min(0, { message: 'Le taux ne peut pas être négatif' })
  @Max(1, { message: 'Le taux ne peut pas dépasser 1 (100%)' })
  rate: number;

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

/** DELETE body (optional): the override the operator believes is in place. */
export class ClearSellerCommissionDto {
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
