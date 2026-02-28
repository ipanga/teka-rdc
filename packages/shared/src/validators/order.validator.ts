import { z } from 'zod';
import { ORDER_STATUSES, PAYMENT_METHODS } from '../constants/order';

export const checkoutSchema = z.object({
  deliveryAddressId: z.string().uuid('Adresse de livraison invalide'),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    errorMap: () => ({ message: 'Mode de paiement invalide' }),
  }),
  idempotencyKey: z.string().uuid('Clé d\'idempotence invalide'),
  buyerNote: z
    .string()
    .max(500, 'La note ne peut pas dépasser 500 caractères')
    .optional(),
});

export const cancelOrderSchema = z.object({
  reason: z
    .string()
    .max(500, 'La raison ne peut pas dépasser 500 caractères')
    .optional(),
});

export const rejectOrderSchema = z.object({
  reason: z
    .string()
    .min(5, 'La raison doit contenir au moins 5 caractères')
    .max(500, 'La raison ne peut pas dépasser 500 caractères'),
});

export const forceStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES, {
    errorMap: () => ({ message: 'Statut de commande invalide' }),
  }),
  note: z
    .string()
    .max(500, 'La note ne peut pas dépasser 500 caractères')
    .optional(),
});

export const orderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z
    .enum(ORDER_STATUSES, {
      errorMap: () => ({ message: 'Statut de commande invalide' }),
    })
    .optional(),
});
