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
  locale: z.enum(['fr', 'en']).optional().default('fr'),
});

export const loginSchema = z.object({
  phone: z.string().regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide'),
  code: z.string().length(6, 'Code requis'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Token de rafraîchissement requis'),
});
