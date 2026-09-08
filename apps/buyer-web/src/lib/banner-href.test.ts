import { describe, expect, it } from 'vitest';
import { bannerHref } from './banner-href';

describe('bannerHref (SEO-2 — banners are real links)', () => {
  it('resolves each link type like the old router.push did', () => {
    expect(bannerHref({ linkType: 'product', linkTarget: 'abc123' })).toEqual({ href: '/abc123', external: false });
    expect(bannerHref({ linkType: 'category', linkTarget: 'telephones' }, 'lubumbashi')).toEqual({ href: '/lubumbashi/categorie/telephones', external: false });
    expect(bannerHref({ linkType: 'category', linkTarget: 'telephones' }, null)).toEqual({ href: '/categorie/telephones', external: false });
    expect(bannerHref({ linkType: 'promotion', linkTarget: 'x' })).toEqual({ href: '/categories', external: false });
    expect(bannerHref({ linkType: 'url', linkTarget: 'https://example.com/p' })).toEqual({ href: 'https://example.com/p', external: true });
  });

  it('is null without a target (plain, non-clickable slide)', () => {
    expect(bannerHref({ linkType: 'category', linkTarget: null })).toBeNull();
    expect(bannerHref({ linkType: null, linkTarget: 'x' })).toBeNull();
  });
});
