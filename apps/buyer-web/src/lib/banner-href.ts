import type { Banner } from '@/lib/types';

/**
 * Where an admin banner points, as a real href (SEO-2). The carousel used to
 * navigate with `router.push` from an `onClick` on a <div>, so the slides were
 * not links at all — nothing for a crawler to follow, and no native link
 * behaviour (middle-click, copy link) for buyers. Same resolution rules as
 * before: a product target is the flat `/{id-or-slug}` the [ville] dispatcher
 * 308s to its canonical URL; a category target is town-scoped when the town is
 * known; a promotion target sends to the category index; a `url` target is
 * external and opens in a new tab.
 */
export function bannerHref(
  banner: Pick<Banner, 'linkType' | 'linkTarget'>,
  citySlug?: string | null,
): { href: string; external: boolean } | null {
  if (!banner.linkType || !banner.linkTarget) return null;
  switch (banner.linkType) {
    case 'product':
      return { href: `/${banner.linkTarget}`, external: false };
    case 'category':
      return {
        href: citySlug ? `/${citySlug}/categorie/${banner.linkTarget}` : `/categorie/${banner.linkTarget}`,
        external: false,
      };
    case 'promotion':
      // No bare /products route exists — the category index is the landing.
      return { href: '/categories', external: false };
    case 'url':
      return { href: banner.linkTarget, external: true };
    default:
      return null;
  }
}
