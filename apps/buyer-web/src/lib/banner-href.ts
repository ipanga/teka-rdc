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
 *
 * S22 (2026-09-09): the API validates these values on write, but this is the
 * sink, so it refuses anything unsafe on render too — defence in depth against
 * a row written before the validator existed, or by any future path that
 * bypasses the DTO. A rejected banner renders as a non-link rather than as a
 * `javascript:` anchor or an off-site redirect.
 */

/** Site-relative, single leading slash — never protocol-relative. */
function isSafeInternalPath(value: string): boolean {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\') &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f\s]/.test(value)
  );
}

/**
 * Absolute https URL, any host — external campaign links are intentional.
 * The scheme is the vulnerability, not the destination: `https:` only rejects
 * `javascript:`, `data:`, `file:` and friends by construction. Mirrors
 * `isValidBannerLink` in the API.
 */
function isSafeExternalUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** A path segment we build a route from — never a URL or a traversal. */
function isSafeSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value);
}
export function bannerHref(
  banner: Pick<Banner, 'linkType' | 'linkTarget'>,
  citySlug?: string | null,
): { href: string; external: boolean } | null {
  if (!banner.linkType || !banner.linkTarget) return null;
  switch (banner.linkType) {
    case 'product':
      if (!isSafeSegment(banner.linkTarget)) return null;
      return { href: `/${banner.linkTarget}`, external: false };
    case 'category':
      if (!isSafeSegment(banner.linkTarget)) return null;
      return {
        href: citySlug ? `/${citySlug}/categorie/${banner.linkTarget}` : `/categorie/${banner.linkTarget}`,
        external: false,
      };
    case 'promotion':
      // No bare /products route exists — the category index is the landing.
      return { href: '/categories', external: false };
    case 'url':
      // Admins also store site-relative targets (« /categories ») under `url`:
      // those are internal links, same tab; only absolute URLs are external.
      if (isSafeInternalPath(banner.linkTarget)) {
        return { href: banner.linkTarget, external: false };
      }
      if (isSafeExternalUrl(banner.linkTarget)) {
        return { href: banner.linkTarget, external: true };
      }
      return null;
    default:
      return null;
  }
}
