import { User } from './user';

// PHONE_OTP is preserved on the enum for historical accounts (legacy buyers
// not yet migrated to email+password). GOOGLE is preserved for any account
// that was created via the removed Google OAuth path. No new accounts use
// either provider.
export type AuthProvider = 'PHONE_OTP' | 'EMAIL_PASSWORD' | 'GOOGLE';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

// ---------------------------------------------------------------------------
// Email + password (buyer, seller, admin all share this surface).
// ---------------------------------------------------------------------------

export interface EmailLoginDto {
  email: string;
  password: string;
}

export interface EmailRegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface PasswordResetRequestDto {
  email: string;
}

export interface PasswordResetConfirmDto {
  token: string;
  newPassword: string;
}

// ---------------------------------------------------------------------------
// Buyer migration (legacy PHONE_OTP → EMAIL_PASSWORD).
// ---------------------------------------------------------------------------

export interface BuyerMigrateCheckDto {
  phone: string;
}

export interface BuyerMigrateLinkEmailDto {
  phone: string;
  email: string;
}

export interface BuyerPasswordSetupDto {
  token: string;
  password: string;
}

export type BuyerMigrationResponse =
  | { migration: 'unknown' }
  | { migration: 'needs_email_setup' }
  | { migration: 'already_migrated' }
  | { migration: 'email_setup_sent' };

// ---------------------------------------------------------------------------
// Seller migration (same shape — OTP step removed in May 2026 refactor).
// ---------------------------------------------------------------------------

export interface SellerMigrateCheckDto {
  email: string;
}

export interface SellerMigrateLinkEmailDto {
  phone: string;
  email: string;
}

export interface SellerPasswordSetupDto {
  token: string;
  password: string;
}

export type SellerMigrationResponse =
  | { migration: 'email_setup_sent' }
  | { migration: 'email_required'; maskedPhone: string | null }
  | { migration: 'already_migrated' };
