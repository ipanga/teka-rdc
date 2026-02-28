import { z } from 'zod';

export const createReviewSchema = z.object({
  productId: z.string().uuid({ message: 'ID de produit invalide' }),
  orderId: z.string().uuid({ message: 'ID de commande invalide' }),
  rating: z.number().int().min(1, { message: 'Note minimum: 1' }).max(5, { message: 'Note maximum: 5' }),
  text: z.string().max(1000, { message: 'Le commentaire ne peut pas dépasser 1000 caractères' }).optional(),
});

export const reviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest']).default('newest'),
});
