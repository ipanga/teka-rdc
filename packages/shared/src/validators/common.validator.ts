import { z } from 'zod';

export const emailSchema = z.string().email('Adresse email invalide');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const uuidSchema = z.string().uuid('Identifiant invalide');

/**
 * @deprecated Platform is monolingual since 2026-04-25. New code should use
 * `z.string()` directly. This export stays as a non-empty-string validator
 * with the same French-required error message so legacy imports still
 * compile during the transition.
 */
export const translatableTextSchema = z
  .string()
  .min(1, 'Le texte en français est requis');
