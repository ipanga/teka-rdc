import { z } from 'zod';
import { DRC_PHONE_REGEX } from '../constants/phone';

// ---------------------------------------------------------------------------
// Email + password — the primary auth surface for all roles since the
// 2026-05-12 buyer-email refactor. /v1/auth/register/buyer creates BUYER;
// /v1/auth/register/email creates SELLER; admins are seeded out-of-band.
// ---------------------------------------------------------------------------

// Password rules: 8–72 chars, at least one letter and one digit.
// 72 cap matches bcrypt's internal truncation.
export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(72, 'Le mot de passe ne peut dépasser 72 caractères')
  .regex(/[A-Za-z]/, 'Le mot de passe doit contenir au moins une lettre')
  .regex(/\d/, 'Le mot de passe doit contenir au moins un chiffre');

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Adresse email invalide');

export const emailLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis'),
});

export const emailRegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z
    .string()
    .min(2, 'Le prénom doit contenir au moins 2 caractères')
    .max(50),
  lastName: z
    .string()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(50),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  newPassword: passwordSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Token de rafraîchissement requis'),
});

// ---------------------------------------------------------------------------
// Buyer migration (legacy PHONE_OTP buyer → email + password).
// Three steps: migrate-check (phone lookup) → migrate-link-email (stash email
// + send setup link) → setup-password (consume JWT, set email + password).
// ---------------------------------------------------------------------------

export const buyerMigrateCheckSchema = z.object({
  phone: z
    .string()
    .regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide. Format: +243XXXXXXXXX'),
});

export const buyerMigrateLinkEmailSchema = z.object({
  phone: z.string().regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide'),
  email: emailSchema,
});

export const buyerPasswordSetupSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  password: passwordSchema,
});

// ---------------------------------------------------------------------------
// Seller migration (legacy PHONE_OTP seller → email + password).
// Same shape as buyer migration since OTP was removed from this flow too.
// ---------------------------------------------------------------------------

export const sellerMigrateCheckSchema = z.object({
  email: emailSchema,
});

export const sellerMigrateLinkEmailSchema = z.object({
  phone: z.string().regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide'),
  email: emailSchema,
});

export const sellerPasswordSetupSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  password: passwordSchema,
});
