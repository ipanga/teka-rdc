/**
 * Where a town switch should navigate (Town Switcher UX, 2026-06-22). Single
 * source of truth — keeps context where the page exists in every town, else
 * lands on the town's storefront:
 *
 *   /{ville}/categorie/{rest}  →  /{newSlug}/categorie/{rest}   (taxonomy is town-agnostic)
 *   everything else            →  /{newSlug}                     (product, /, /recherche, town landing)
 *
 * Always resolves to a real SSR page → SEO-clean. No per-page logic lives at the
 * call sites; they all go through here.
 */
export function resolveTownSwitchUrl(pathname: string, newSlug: string): string {
  const categoryMatch = pathname.match(/^\/[^/]+\/categorie\/(.+)$/);
  if (categoryMatch) return `/${newSlug}/categorie/${categoryMatch[1]}`;
  return `/${newSlug}`;
}
