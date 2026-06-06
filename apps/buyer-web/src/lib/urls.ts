/**
 * Single source of truth for buyer-web URL construction (city-first URL
 * refactor, 2026-06-06). Every product / category / city link goes through
 * here so the scheme stays consistent and is changed in exactly one place.
 *
 * Scheme:
 *   /                                  global homepage
 *   /{ville}                           city landing
 *   /{ville}/{slug}-{shortCode}        product detail
 *   /{ville}/categorie/{catSlug}       city-scoped category
 *
 * The product `slug` is cosmetic; the trailing `shortCode` is the resolver.
 */

const SHORT_CODE_RE = /^[a-z0-9]{6}$/;

interface ProductLinkFields {
  id: string;
  slug?: string | null;
  shortCode?: string | null;
  citySlug?: string | null;
}

/**
 * The resolvable tail of a product URL: `{slug}-{shortCode}`, or just
 * `{shortCode}` when there's no slug, falling back to slug/id for legacy rows
 * that predate shortCode (the route dispatcher then 301s to canonical).
 */
export function productTail(p: ProductLinkFields): string {
  if (p.shortCode) {
    return p.slug ? `${p.slug}-${p.shortCode}` : p.shortCode;
  }
  return p.slug ?? p.id;
}

/** Canonical product URL `/{citySlug}/{slug}-{shortCode}`. */
export function productHref(p: ProductLinkFields): string {
  const tail = productTail(p);
  // No city (legacy/unscoped row): emit a flat `/{tail}` — the [ville]
  // dispatcher resolves it and 301s to the canonical city URL.
  return p.citySlug ? `/${p.citySlug}/${tail}` : `/${tail}`;
}

/** City landing URL `/{citySlug}`. */
export function cityHref(citySlug: string): string {
  return `/${citySlug}`;
}

/**
 * City-scoped category URL `/{citySlug}/categorie/{catSlug}`. When no city is
 * known, falls back to the global `/categorie/{catSlug}` (which itself 301s to
 * the default city), and to `/categories/{id}` when the category has no slug.
 */
export function categoryHref(
  citySlug: string | null | undefined,
  cat: { slug?: string | null; id: string },
): string {
  if (!cat.slug) return `/categories/${cat.id}`;
  return citySlug ? `/${citySlug}/categorie/${cat.slug}` : `/categorie/${cat.slug}`;
}

/**
 * Extract the product resolver token from a `[product]` route segment:
 *   "iphone-15-pro-max-a1b2c3" -> "a1b2c3"   (shortCode tail)
 *   "a1b2c3"                   -> "a1b2c3"   (bare shortCode)
 *   "<uuid>"                   -> "<uuid>"   (UUID passes through)
 *   "legacy-old-slug"          -> whole      (slug fallback in the API)
 * The browse API resolves shortCode, UUID, and slug, so returning the whole
 * segment when there's no shortCode tail still works.
 */
export function productIdentifierFromParam(param: string): string {
  const lastDash = param.lastIndexOf('-');
  if (lastDash !== -1) {
    const tail = param.slice(lastDash + 1);
    if (SHORT_CODE_RE.test(tail)) return tail;
  }
  return param;
}
