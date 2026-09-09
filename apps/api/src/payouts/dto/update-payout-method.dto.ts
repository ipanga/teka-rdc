import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PAYOUT_METHODS } from './request-payout.dto';

/**
 * Set/update the seller's reusable payout destination (mobile money).
 */
export class UpdatePayoutMethodDto {
  @IsEnum(PAYOUT_METHODS, {
    message:
      "La méthode de paiement doit être l'une des suivantes : M_PESA, AIRTEL_MONEY, ORANGE_MONEY",
  })
  @IsNotEmpty({ message: 'La méthode de paiement est requise' })
  payoutMethod: string;

  @Matches(/^\+243[0-9]{9}$/, {
    message: 'Le numéro de téléphone doit être au format +243XXXXXXXXX',
  })
  @IsNotEmpty({ message: 'Le numéro de téléphone est requis' })
  payoutPhone: string;

  /**
   * S12: changing where money is sent is a sensitive action — the seller
   * confirms with their CURRENT password. Verified against the stored hash,
   * never logged, never persisted, never forwarded to analytics or Sentry.
   *
   * Optional at the DTO level only so that a client re-sending the UNCHANGED
   * destination (the distributed seller-mobile 0.1.9 saves before every
   * request) is a harmless no-op; the service refuses any actual change
   * without it (400, French).
   */
  @IsOptional()
  @IsString({ message: 'Mot de passe invalide.' })
  @MaxLength(72, { message: 'Mot de passe invalide.' })
  password?: string;
}
