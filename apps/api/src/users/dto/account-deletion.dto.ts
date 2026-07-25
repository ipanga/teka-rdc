import { Equals, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Request body for `POST /v1/users/account/deletion`.
 *
 * Re-authentication is role-specific and enforced server-side:
 *   - BUYER  → `otpCode` (a fresh WhatsApp OTP for the account's phone)
 *   - SELLER → `password` (current account password)
 *
 * `confirmPhrase` must be the literal "SUPPRIMER" — a deliberate,
 * hard-to-trigger-accidentally confirmation typed by the user.
 */
export class RequestAccountDeletionDto {
  @Equals('SUPPRIMER', {
    message: 'Veuillez saisir SUPPRIMER pour confirmer.',
  })
  confirmPhrase!: string;

  /** Seller/admin re-auth: current password. */
  @IsOptional()
  @IsString()
  @MaxLength(72)
  password?: string;

  /** Buyer re-auth: a fresh WhatsApp OTP code. */
  @IsOptional()
  @IsString()
  @MaxLength(12)
  otpCode?: string;
}
