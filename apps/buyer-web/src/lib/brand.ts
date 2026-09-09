/**
 * The brand library ships one placeholder, « Autre » (taxonomy-data.ts,
 * n: 1 — linked to every product type), for products with no real brand. It
 * must never be published as a schema.org `Brand` (SEO-2): a brand named
 * « Other » is false structured data. The API exposes brands by name only, so
 * the placeholder is recognised by its seeded name.
 */
export const PLACEHOLDER_BRAND_NAME = 'Autre';

export function isRealBrand(
  brand: { name?: string | null } | null | undefined,
): brand is { name: string } {
  const name = brand?.name?.trim();
  return !!name && name.toLowerCase() !== PLACEHOLDER_BRAND_NAME.toLowerCase();
}
