import { User } from './user';

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
