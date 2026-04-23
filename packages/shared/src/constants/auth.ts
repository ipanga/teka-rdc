export enum SellerApplicationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RATE_LIMIT_MAX = 3;
export const OTP_RATE_LIMIT_WINDOW_SECONDS = 600; // 10 minutes
export const DEV_OTP_CODE = '123456';

export const AUTH_COOKIE_NAMES = {
  access: 'teka_access_token',
  refresh: 'teka_refresh_token',
} as const;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72; // bcrypt truncates above 72

export const AUTH_PROVIDERS = ['PHONE_OTP', 'EMAIL_PASSWORD', 'GOOGLE'] as const;
