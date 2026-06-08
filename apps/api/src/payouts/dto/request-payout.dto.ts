import { IsEnum, IsOptional, Matches } from 'class-validator';

export const PAYOUT_METHODS = [
  'M_PESA',
  'AIRTEL_MONEY',
  'ORANGE_MONEY',
] as const;

/**
 * Payout request. Method + phone are OPTIONAL: when omitted, the seller's saved
 * payout destination (SellerProfile.payoutMethod/payoutPhone) is used. The
 * service rejects the request if neither the body nor the saved profile has a
 * destination.
 */
export class RequestPayoutDto {
  @IsOptional()
  @IsEnum(PAYOUT_METHODS, {
    message:
      "La méthode de paiement doit être l'une des suivantes : M_PESA, AIRTEL_MONEY, ORANGE_MONEY",
  })
  payoutMethod?: string;

  @IsOptional()
  @Matches(/^\+243[0-9]{9}$/, {
    message: 'Le numéro de téléphone doit être au format +243XXXXXXXXX',
  })
  payoutPhone?: string;
}
