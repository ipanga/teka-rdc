import { z } from 'zod';

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
  content: z.string().min(1, { message: 'Le message ne peut pas être vide' }).max(2000, { message: 'Le message est trop long (max 2000 caractères)' }),
}).refine(
  data => data.conversationId || data.sellerId,
  { message: 'conversationId ou sellerId requis' },
);

export const conversationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const messagesQuerySchema = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
