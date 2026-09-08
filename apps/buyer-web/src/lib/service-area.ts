/**
 * Public service-area copy derived from the authoritative active-town list
 * (`GET /v1/cities`, active only — the same source that resolves `/{ville}`).
 *
 * SEO-2 decision 2: no public Buyer Web copy may name a town as served unless
 * it is active. Before this, four metadata strings hard-coded « Lubumbashi,
 * Kolwezi et Likasi » while Likasi was inactive (its landing page 404s). The
 * town list is data, so the copy is built from it: activating a town in the
 * admin makes it appear here on the next render, deactivating removes it —
 * nothing to redeploy, no hard-coded town anywhere in public copy.
 */
export interface ServedTown {
  name: string;
  isActive?: boolean;
  slug?: string | null;
}

/** « Lubumbashi », « Lubumbashi et Kolwezi », « Lubumbashi, Kolwezi et Likasi ». */
export function joinTownNames(towns: ServedTown[]): string {
  const names = towns.filter((t) => t.isActive !== false && t.name).map((t) => t.name);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/**
 * The delivery sentence used in public metadata. With no active town at all
 * (API down at render time, or a fresh install) it degrades to the country,
 * never to a stale town name.
 */
export function deliveryPhrase(towns: ServedTown[], prefix = 'Livraison'): string {
  const names = joinTownNames(towns);
  return names ? `${prefix} à ${names}.` : `${prefix} en RD Congo.`;
}

/** Title suffix « Livraison Lubumbashi & Kolwezi » (short form, no article). */
export function deliveryTitle(towns: ServedTown[]): string {
  const names = towns.filter((t) => t.isActive !== false && t.name).map((t) => t.name);
  return names.length ? `Livraison ${names.join(' & ')}` : 'Livraison en RD Congo';
}
