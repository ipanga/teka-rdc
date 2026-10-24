import { z } from 'zod';

// Monolingual since 2026-04-25 — translatable fields are plain strings.
const translatableText = z.string().min(1);

// The WHATWG URL constructor every runtime (Node, browsers) provides; typed
// here because this package compiles against lib ES2022 only.
declare const URL: new (input: string) => object;

// Zod 3's `string().url()` accepted whatever `new URL(input)` accepts and
// returned the input verbatim. Zod 4's trims it first, so keep the Zod 3
// contract: same acceptance set, same output string, same message.
const zod3Url = (message: string) =>
  z.string().refine(
    (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    { message },
  );

// ============================================================
// BANNER
// ============================================================

// Defaults live on the create schema only: Zod 4's `.partial()` keeps inner
// defaults, so deriving the PATCH schema from a defaulted object would reset
// status/sortOrder on every partial update.
const bannerFields = z.object({
  title: translatableText,
  subtitle: translatableText.optional(),
  imageUrl: zod3Url('URL d\'image invalide'),
  linkUrl: zod3Url('Invalid url').optional(),
  linkType: z.enum(['product', 'category', 'promotion', 'url']).optional(),
  linkTarget: z.string().optional(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE']),
  sortOrder: z.number().int().min(0),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export const createBannerSchema = bannerFields.extend({
  status: bannerFields.shape.status.default('DRAFT'),
  sortOrder: bannerFields.shape.sortOrder.default(0),
});

export const updateBannerSchema = bannerFields.partial();

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
  productId: z.guid().optional(),
  categoryId: z.guid().optional(),
  sellerId: z.guid().optional(),
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
  productId: z.guid({ error: 'ID de produit requis' }),
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
  sellerId: z.guid().optional(),
});

// ============================================================
// DASHBOARD TRENDS
// ============================================================

export const trendQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d']).default('30d'),
});
