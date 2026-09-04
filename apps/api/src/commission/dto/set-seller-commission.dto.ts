import { IsNumber, Max, Min } from 'class-validator';

/**
 * Admin sets a seller-specific commission override. Same domain as the
 * platform / category settings: a fraction in [0, 1] with at most 4 decimals
 * (Decimal(5,4) → 0.01 % precision). `0` is a legitimate 0 % override; "use
 * the default" is expressed by DELETE, never by a sentinel value.
 */
export class SetSellerCommissionDto {
  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'Le taux doit être un nombre avec au maximum 4 décimales' },
  )
  @Min(0, { message: 'Le taux ne peut pas être négatif' })
  @Max(1, { message: 'Le taux ne peut pas dépasser 1 (100%)' })
  rate: number;
}
