import { z } from 'zod';

const translatableText = z.object({
  fr: z.string().min(1),
  en: z.string().optional(),
});

// ============================================================
// BANNER
// ============================================================

export const createBannerSchema = z.object({
  title: translatableText,
  subtitle: translatableText.optional(),
  imageUrl: z.string().url({ message: 'URL d\'image invalide' }),
  linkUrl: z.string().url().optional(),
  linkType: z.enum(['product', 'category', 'promotion', 'url']).optional(),
  linkTarget: z.string().optional(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE']).default('DRAFT'),
  sortOrder: z.number().int().min(0).default(0),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export const updateBannerSchema = createBannerSchema.partial();

// ============================================================
// PROMOTION
// ============================================================

export const createPromotionSchema = z.object({
  type: z.enum(['PROMOTION', 'FLASH_DEAL']),
  title: translatableText,
  description: translatableText.optional(),
  discountPercent: z.number().int().min(1).max(99).optional(),
  discountCDF: z.number().int().min(1).optional(),
  startsAt: z.string().datetime({ message: 'Date de début invalide' }),
  endsAt: z.string().datetime({ message: 'Date de fin invalide' }),
  productId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
}).refine(
  data => data.discountPercent || data.discountCDF,
  { message: 'Un pourcentage ou un montant de réduction est requis' },
);

export const sellerCreatePromotionSchema = z.object({
  type: z.enum(['PROMOTION', 'FLASH_DEAL']),
  title: translatableText,
  description: translatableText.optional(),
  discountPercent: z.number().int().min(1).max(99).optional(),
  discountCDF: z.number().int().min(1).optional(),
  startsAt: z.string().datetime({ message: 'Date de début invalide' }),
  endsAt: z.string().datetime({ message: 'Date de fin invalide' }),
  productId: z.string().uuid({ message: 'ID de produit requis' }),
}).refine(
  data => data.discountPercent || data.discountCDF,
  { message: 'Un pourcentage ou un montant de réduction est requis' },
);

export const promotionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(['PROMOTION', 'FLASH_DEAL']).optional(),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
});

// ============================================================
// CONTENT PAGE
// ============================================================

export const upsertContentSchema = z.object({
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, { message: 'Le slug ne peut contenir que des lettres minuscules, chiffres et tirets' }),
  title: translatableText,
  content: translatableText,
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  sortOrder: z.number().int().min(0).default(0),
});

// ============================================================
// SYSTEM SETTING
// ============================================================

export const updateSettingSchema = z.object({
  value: z.string().min(0),
});

// ============================================================
// NOTIFICATION BROADCAST
// ============================================================

export const createBroadcastSchema = z.object({
  title: z.string().min(1, { message: 'Le titre est requis' }).max(100),
  message: z.string().min(1, { message: 'Le message est requis' }).max(160, { message: 'Le message SMS ne peut pas dépasser 160 caractères' }),
  segment: z.string().min(1, { message: 'Le segment est requis' }),
});

// ============================================================
// REPORTS
// ============================================================

export const reportQuerySchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  sellerId: z.string().uuid().optional(),
});

// ============================================================
// DASHBOARD TRENDS
// ============================================================

export const trendQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d']).default('30d'),
});
