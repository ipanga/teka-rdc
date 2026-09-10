import { describe, expect, it } from 'vitest';
import { bannerHref } from './banner-href';

describe('bannerHref (SEO-2 — banners are real links)', () => {
  it('resolves each link type like the old router.push did', () => {
    expect(bannerHref({ linkType: 'product', linkTarget: 'abc123' })).toEqual({ href: '/abc123', external: false });
    expect(bannerHref({ linkType: 'category', linkTarget: 'telephones' }, 'lubumbashi')).toEqual({ href: '/lubumbashi/categorie/telephones', external: false });
    expect(bannerHref({ linkType: 'category', linkTarget: 'telephones' }, null)).toEqual({ href: '/categorie/telephones', external: false });
    expect(bannerHref({ linkType: 'promotion', linkTarget: 'x' })).toEqual({ href: '/categories', external: false });
    expect(bannerHref({ linkType: 'url', linkTarget: 'https://example.com/p' })).toEqual({ href: 'https://example.com/p', external: true });
    // A site-relative `url` target is an internal link (same tab, crawlable).
    expect(bannerHref({ linkType: 'url', linkTarget: '/categories' })).toEqual({ href: '/categories', external: false });
  });

  it('is null without a target (plain, non-clickable slide)', () => {
    expect(bannerHref({ linkType: 'category', linkTarget: null })).toBeNull();
    expect(bannerHref({ linkType: null, linkTarget: 'x' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// S22 (2026-09-09) — the render sink refuses unsafe admin-authored links.
// The API validates on write; this is defence in depth for rows written
// before that validator existed or by any path that bypasses the DTO.
// ---------------------------------------------------------------------------
describe('bannerHref — unsafe links are refused at the sink (S22)', () => {
  it('refuses javascript:, data:, file: and vbscript: under linkType "url"', () => {
    for (const target of [
      'javascript:alert(document.cookie)',
      'JavaScript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'file:///etc/passwd',
      'vbscript:msgbox(1)',
    ]) {
      expect(bannerHref({ linkType: 'url', linkTarget: target })).toBeNull();
    }
  });

  it('refuses protocol-relative and backslash-relative targets that resolve off-site', () => {
    for (const target of ['//evil.example', '//evil.example/path', '/\\evil.example']) {
      expect(bannerHref({ linkType: 'url', linkTarget: target })).toBeNull();
    }
  });

  it('refuses plain http (a downgrade) while keeping https external links working', () => {
    // External campaign links are an intentional capability, so the HOST is
    // not restricted — the scheme is what made this a vulnerability.
    expect(bannerHref({ linkType: 'url', linkTarget: 'http://example.com/x' })).toBeNull();
    expect(bannerHref({ linkType: 'url', linkTarget: 'https://partner.example/campaign' })).toEqual({
      href: 'https://partner.example/campaign',
      external: true,
    });
  });

  it('still allows a site-relative path and an https Teka link', () => {
    expect(bannerHref({ linkType: 'url', linkTarget: '/categories' })).toEqual({
      href: '/categories',
      external: false,
    });
    expect(bannerHref({ linkType: 'url', linkTarget: 'https://teka.cd/promotions' })).toEqual({
      href: 'https://teka.cd/promotions',
      external: true,
    });
  });

  it('refuses a product or category target that is a URL or a traversal, and keeps plain slugs working', () => {
    expect(bannerHref({ linkType: 'product', linkTarget: '../../etc/passwd' })).toBeNull();
    expect(bannerHref({ linkType: 'product', linkTarget: 'javascript:alert(1)' })).toBeNull();
    expect(bannerHref({ linkType: 'category', linkTarget: '//evil.example' })).toBeNull();
    expect(bannerHref({ linkType: 'product', linkTarget: 'chemise-h0d799' })).toEqual({
      href: '/chemise-h0d799',
      external: false,
    });
    expect(bannerHref({ linkType: 'category', linkTarget: 'mode' }, 'lubumbashi')).toEqual({
      href: '/lubumbashi/categorie/mode',
      external: false,
    });
  });

  it('refuses control characters smuggled into an otherwise internal path', () => {
    expect(bannerHref({ linkType: 'url', linkTarget: '/categories\nSet-Cookie: x=1' })).toBeNull();
    expect(bannerHref({ linkType: 'url', linkTarget: '/cat egories' })).toBeNull();
  });
});
