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
