/**
 * Generate a URL-friendly slug from a French product title + short ID suffix.
 * Format: "samsung-galaxy-a15-128go-abc123"
 * The 6-char UUID prefix ensures uniqueness even if titles collide.
 */
export function generateProductSlug(frenchTitle: string, productId: string): string {
  const base = frenchTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents (é→e, à→a)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')    // remove non-alphanumeric
    .trim()
    .replace(/\s+/g, '-')            // spaces → hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .substring(0, 80);               // max 80 chars for title portion

  // Use first 6 hex chars of UUID (without hyphens) as uniqueness suffix
  const shortId = productId.replace(/-/g, '').substring(0, 6);
  return `${base}-${shortId}`;
}
