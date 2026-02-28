import { z } from 'zod';

const translatableTextSchema = z.object({
  fr: z.string().min(1, 'Le texte en français est requis'),
  en: z.string().optional(),
});

export const createCategorySchema = z.object({
  name: translatableTextSchema,
  description: translatableTextSchema.optional(),
  parentCategoryId: z.string().uuid().optional().nullable(),
  emoji: z.string().max(4).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createProductSchema = z.object({
  title: translatableTextSchema,
  description: translatableTextSchema,
  categoryId: z.string().uuid('Catégorie invalide'),
  priceCDF: z.string().regex(/^\d+$/, 'Le prix CDF doit être un nombre entier positif'),
  priceUSD: z.string().regex(/^\d+$/).optional().nullable(),
  quantity: z.number().int().min(0, 'La quantité ne peut pas être négative'),
  condition: z.enum(['NEW', 'USED']),
  specifications: z.array(z.object({
    attributeId: z.string().uuid(),
    value: z.string().min(1),
  })).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const browseProductsSchema = z.object({
  categoryId: z.string().uuid().optional(),
  minPrice: z.string().regex(/^\d+$/).optional(),
  maxPrice: z.string().regex(/^\d+$/).optional(),
  condition: z.enum(['NEW', 'USED']).optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['popularity', 'price_low', 'price_high', 'newest']).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const createAttributeSchema = z.object({
  name: translatableTextSchema,
  type: z.enum(['TEXT', 'SELECT', 'MULTISELECT', 'NUMERIC']),
  options: z.array(z.string()).optional().nullable(),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
