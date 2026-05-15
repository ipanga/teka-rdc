import { z } from 'zod';
import { DRC_PHONE_REGEX } from '../constants/phone';

// ---------------------------------------------------------------------------
// Email + password — auth surface for sellers and admins.
// /v1/auth/register/email creates SELLER; admins are seeded out-of-band.
// Buyers authenticate via WhatsApp OTP (see buyerOtp*Schema below) since
// the 2026-05-15 reversal of the 2026-05-12 buyer email refactor.
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
// Buyer WhatsApp OTP authentication (2026-05-15).
// Single two-step flow: /buyer/otp/request (issue) → /buyer/otp/verify
// (find-or-create user). Resend has its own endpoint to keep the cooldown
// response separate.
// ---------------------------------------------------------------------------

export const buyerOtpRequestSchema = z.object({
  phone: z
    .string()
    .regex(
      DRC_PHONE_REGEX,
      'Numéro de téléphone invalide. Format: +243XXXXXXXXX',
    ),
});

export const buyerOtpVerifySchema = z.object({
  phone: z.string().regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide'),
  code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres requis'),
  firstName: z
    .string()
    .min(2, 'Le prénom doit contenir au moins 2 caractères')
    .max(50)
    .optional(),
  lastName: z
    .string()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(50)
    .optional(),
});

export const buyerOtpResendSchema = z.object({
  phone: z.string().regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide'),
});

// ---------------------------------------------------------------------------
// Buyer claim flow (email-only legacy buyers attaching a phone).
// Used by the 2026-05-12..05-15 cohort that registered with email+password
// before WhatsApp OTP became the canonical buyer flow. Step 1 emails a
// magic link; step 2 (rendered from the link) verifies the JWT + a fresh
// WhatsApp OTP and attaches the phone to the existing User.
// ---------------------------------------------------------------------------

export const buyerClaimRequestSchema = z.object({
  email: emailSchema,
});

export const buyerClaimVerifySchema = z.object({
  token: z.string().min(1, 'Token requis'),
  phone: z.string().regex(DRC_PHONE_REGEX, 'Numéro de téléphone invalide'),
  code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres requis'),
});

// ---------------------------------------------------------------------------
// Seller migration (legacy PHONE_OTP seller → email + password).
// Same shape since OTP was removed from this flow.
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
