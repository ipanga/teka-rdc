import { z } from 'zod';
import { DRC_PHONE_REGEX } from '../constants/phone';

export const otpRequestSchema = z.object({
  phone: z.string().regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide. Format: +243XXXXXXXXX'),
});

export const otpVerifySchema = z.object({
  phone: z.string().regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide'),
  code: z.string().length(6, 'Le code doit contenir 6 chiffres').regex(/^\d{6}$/, 'Le code doit contenir uniquement des chiffres'),
});

export const registerSchema = z.object({
  phone: z.string().regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide'),
  code: z.string().length(6, 'Code requis'),
  firstName: z.string().min(2, 'Le prénom doit contenir au moins 2 caractères').max(50),
  lastName: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').max(50),
});

export const loginSchema = z.object({
  phone: z.string().regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide'),
  code: z.string().length(6, 'Code requis'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Token de rafraîchissement requis'),
});

// Password rules: 8–72 chars, at least one letter and one digit.
// 72 cap matches bcrypt's internal truncation.
export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(72, 'Le mot de passe ne peut dépasser 72 caractères')
  .regex(/[A-Za-z]/, 'Le mot de passe doit contenir au moins une lettre')
  .regex(/\d/, 'Le mot de passe doit contenir au moins un chiffre');

const emailSchema = z.string().trim().toLowerCase().email('Adresse email invalide');

export const emailLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis'),
});

export const emailRegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(2, 'Le prénom doit contenir au moins 2 caractères').max(50),
  lastName: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').max(50),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  newPassword: passwordSchema,
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'Jeton Google requis'),
});

export const emailOtpFallbackSchema = z.object({
  phone: z.string().regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide'),
});

export const sellerMigrateCheckSchema = z.object({
  email: emailSchema,
});

export const sellerMigrateLinkEmailSchema = z.object({
  phone: z.string().regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide'),
  code: z.string().length(6, 'Code requis'),
  email: emailSchema,
});

export const sellerPasswordSetupSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  password: passwordSchema,
});
