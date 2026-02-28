import { z } from 'zod';

export const addToCartSchema = z.object({
  productId: z.string().uuid('Identifiant produit invalide'),
  quantity: z
    .number()
    .int('La quantité doit être un nombre entier')
    .min(1, 'La quantité minimum est 1')
    .max(99, 'La quantité maximum est 99'),
});

export const updateCartItemSchema = z.object({
  quantity: z
    .number()
    .int('La quantité doit être un nombre entier')
    .min(1, 'La quantité minimum est 1')
    .max(99, 'La quantité maximum est 99'),
});

export const mergeCartSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid('Identifiant produit invalide'),
        quantity: z
          .number()
          .int()
          .min(1, 'La quantité minimum est 1'),
      }),
    )
    .min(1, 'Le panier ne peut pas être vide'),
});
