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

/**
 * Per-surface auth cookie names. admin / seller / buyer each get their OWN
 * cookie namespace so the three sessions stay isolated in a single browser
 * even though they share the `.teka.cd` domain (required so the API on
 * api.teka.cd receives them). Logging out / expiring on one surface no longer
 * touches the others. The API resolves the surface from the `X-Teka-Surface`
 * header each web app's api-client sends; mobile uses bearer tokens (no
 * cookies). Mirror of `apps/api/src/auth/surface.util.ts`.
 */
export type AuthSurface = 'admin' | 'seller' | 'buyer';

export function cookieNamesFor(surface: AuthSurface) {
  return {
    access: `teka_${surface}_access_token`,
    refresh: `teka_${surface}_refresh_token`,
    session: `teka_${surface}_session`,
  } as const;
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72; // bcrypt truncates above 72

export const AUTH_PROVIDERS = ['PHONE_OTP', 'EMAIL_PASSWORD', 'GOOGLE'] as const;
