import type { BrowseProduct, ProductDetail } from './types';

// Client-local "recently viewed" history (Phase D / D-3). Stored in
// localStorage only — Initiative #2 deliberately keeps *persisted* (server-side)
// view-tracking out of scope. Per-device, most-recent-first, deduped, capped.
// Entries are snapshots: price/stock may be stale, but tapping one navigates to
// the live PDP, so that's acceptable for a convenience strip.
const KEY = 'teka_recently_viewed';
const MAX = 12;

export function getRecentlyViewed(): BrowseProduct[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BrowseProduct[]) : [];
  } catch {
    return [];
  }
}

/** Map a PDP detail to the lightweight BrowseProduct shape the cards consume. */
export function detailToBrowseProduct(d: ProductDetail): BrowseProduct {
  const img = d.images?.[0];
  return {
    id: d.id,
    slug: d.slug,
    shortCode: d.shortCode,
    title: d.title,
    priceCDF: d.priceCDF,
    priceUSD: d.priceUSD,
    condition: d.condition,
    quantity: d.quantity,
    image: img ? { url: img.url, thumbnailUrl: img.thumbnailUrl } : null,
    seller: d.seller,
    categoryId: d.categoryId,
    cityId: d.cityId,
    citySlug: d.city?.slug ?? null,
    cityName: d.city?.name ?? null,
    unitsSold: d.unitsSold,
  };
}

/** Record a freshly-viewed product at the front of the history. */
export function addRecentlyViewed(product: BrowseProduct): void {
  if (typeof window === 'undefined') return;
  try {
    const next = [
      product,
      ...getRecentlyViewed().filter((p) => p.id !== product.id),
    ].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / serialization errors — the strip is best-effort.
  }
}
