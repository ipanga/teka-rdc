import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Admin rejects a payout (REQUESTED / APPROVED / PROCESSING). The reason is
 * shown to the seller and preserved in the audit trail, so it must be a real
 * sentence — not a single character.
 */
export class RejectPayoutDto {
  @IsString({ message: 'La raison doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'La raison du rejet est requise' })
  @MinLength(5, { message: 'La raison du rejet doit contenir au moins 5 caractères' })
  @MaxLength(500, { message: 'La raison du rejet est trop longue (500 max)' })
  reason: string;
}
