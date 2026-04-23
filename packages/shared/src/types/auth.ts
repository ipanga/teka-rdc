import { User } from './user';

export type AuthProvider = 'PHONE_OTP' | 'EMAIL_PASSWORD' | 'GOOGLE';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface OtpRequestDto {
  phone: string;
}

export interface OtpVerifyDto {
  phone: string;
  code: string;
}

export interface OtpVerifyResponse {
  verified: boolean;
  exists: boolean;
}

export interface RegisterDto {
  phone: string;
  code: string;
  firstName: string;
  lastName: string;
  locale?: string;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

// Email + password
export interface EmailLoginDto {
  email: string;
  password: string;
}

export interface EmailRegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  locale?: 'fr' | 'en';
}

// Password reset
export interface PasswordResetRequestDto {
  email: string;
}

export interface PasswordResetConfirmDto {
  token: string;
  newPassword: string;
}

// Google OAuth
export interface GoogleLoginDto {
  idToken: string;
}

// Email OTP fallback (buyers)
export interface EmailOtpFallbackDto {
  phone: string;
}

// Seller migration
export interface SellerMigrateCheckDto {
  email: string;
}

export interface SellerMigrateLinkEmailDto {
  phone: string;
  code: string;
  email: string;
}

export interface SellerPasswordSetupDto {
  token: string;
  password: string;
}

export type SellerMigrationResponse =
  | { migration: 'email_setup_sent' }
  | { migration: 'email_required'; maskedPhone: string }
  | { migration: 'already_migrated' };
