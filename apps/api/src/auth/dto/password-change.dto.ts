import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * In-app password change for an authenticated user. Sellers + admins use
 * this from the profile page. Buyers don't have passwords (WhatsApp OTP
 * since 2026-05-15) and are rejected at the service layer.
 *
 * Old-password verification + new-password rules + atomic refresh-token
 * revocation (force re-login on other devices) live in
 * AuthService.changePassword.
 */
export class PasswordChangeDto {
  @IsString()
  @MinLength(1, { message: 'Mot de passe actuel requis' })
  currentPassword: string;

  @IsString()
  @MinLength(8, {
    message: 'Le mot de passe doit contenir au moins 8 caractères',
  })
  @MaxLength(72, { message: 'Le mot de passe ne peut dépasser 72 caractères' })
  @Matches(/[A-Za-z]/, {
    message: 'Le mot de passe doit contenir au moins une lettre',
  })
  @Matches(/\d/, {
    message: 'Le mot de passe doit contenir au moins un chiffre',
  })
  newPassword: string;
}
