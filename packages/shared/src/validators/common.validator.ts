import { z } from 'zod';

// Zod 3's email pattern, pinned so the Zod 4 upgrade accepts exactly the
// addresses it always did (no stricter surprise for existing accounts).
const EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;

export const emailSchema = z.email({
  pattern: EMAIL_PATTERN,
  error: 'Adresse email invalide',
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// `z.guid()`, not `z.uuid()`: Zod 4's uuid enforces the RFC 9562 version and
// variant bits, which the seeded identifiers (`10000000-0000-0000-0000-…`)
// do not carry. guid is the 8-4-4-4-12 hex shape Zod 3's uuid accepted.
export const uuidSchema = z.guid('Identifiant invalide');

/**
 * @deprecated Platform is monolingual since 2026-04-25. New code should use
 * `z.string()` directly. This export stays as a non-empty-string validator
 * with the same French-required error message so legacy imports still
 * compile during the transition.
 */
export const translatableTextSchema = z
  .string()
  .min(1, 'Le texte en français est requis');
