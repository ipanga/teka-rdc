/**
 * Indexability of a town × category listing page (SEO-2 decision 1).
 *
 * Input: the API's TOWN-SCOPED eligible product count
 * (`GET /v1/browse/categories/:slug?cityId=` → `productCount`, computed from
 * `BrowseService.publicProductWhere`). A page is indexable only when the town
 * actually has eligible inventory; otherwise it is `noindex, follow`, stays
 * reachable and self-canonical, and is left out of the sitemap. Both the route
 * and the sitemap use this one predicate, so they can never disagree.
 */
export function isIndexable(category: { productCount?: number | null } | null | undefined): boolean {
  return (category?.productCount ?? 0) > 0;
}

/** Next `robots` metadata for a listing page given its town-scoped count. */
export function listingRobots(category: { productCount?: number | null } | null | undefined) {
  return isIndexable(category) ? { index: true, follow: true } : { index: false, follow: true };
}
