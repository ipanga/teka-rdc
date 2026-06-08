import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Admin marks a payout as paid out-of-band (mobile money / cash). The external
 * reference is the proof of transfer the finance team records for
 * reconciliation (e.g. an M-Pesa transaction id).
 */
export class CompletePayoutDto {
  @IsString({ message: 'La référence doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'La référence de paiement est requise' })
  @MinLength(1, { message: 'La référence de paiement est requise' })
  @MaxLength(200, { message: 'La référence est trop longue (200 max)' })
  externalReference: string;
}
