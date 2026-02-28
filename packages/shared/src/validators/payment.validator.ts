import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  orderId: z.string().uuid({ message: 'ID de commande invalide' }),
  mobileMoneyProvider: z.enum(['M_PESA', 'AIRTEL_MONEY', 'ORANGE_MONEY'], {
    errorMap: () => ({ message: 'Opérateur Mobile Money invalide' }),
  }),
  payerPhone: z.string().regex(/^\+243[0-9]{9}$/, {
    message: 'Format: +243XXXXXXXXX',
  }),
});

export const requestPayoutSchema = z.object({
  payoutMethod: z.enum(['M_PESA', 'AIRTEL_MONEY', 'ORANGE_MONEY'], {
    errorMap: () => ({ message: 'Méthode de paiement invalide' }),
  }),
  payoutPhone: z.string().regex(/^\+243[0-9]{9}$/, {
    message: 'Format: +243XXXXXXXXX',
  }),
});

export const commissionSettingSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  rate: z
    .number()
    .min(0, { message: 'Le taux doit être >= 0' })
    .max(1, { message: 'Le taux doit être <= 1 (100%)' }),
  isActive: z.boolean().default(true),
});

export const rejectPayoutSchema = z.object({
  reason: z.string().min(1, { message: 'La raison du rejet est requise' }),
});
