import { z } from 'zod';

export const emailSchema = z.string().email('Adresse email invalide');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const uuidSchema = z.string().uuid('Identifiant invalide');

export const translatableTextSchema = z.object({
  fr: z.string().min(1, 'Le texte en français est requis'),
  en: z.string().optional(),
});
