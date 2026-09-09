import { isValidBannerLink } from './banner-link.validator';

/**
 * S22 (2026-09-09) — banner links are admin-authored and rendered as anchors
 * on the storefront. The scheme is the vulnerability: `javascript:` executes
 * under the buyer CSP's `script-src 'unsafe-inline'`, and a protocol-relative
 * target resolves to a foreign origin. The destination host is NOT restricted
 * because external campaign links are an intentional capability.
 */
describe('isValidBannerLink (S22)', () => {
  describe('linkType "url"', () => {
    it('rejects every dangerous scheme, in any casing', () => {
      for (const v of [
        'javascript:alert(document.cookie)',
        'JavaScript:alert(1)',
        '  javascript:alert(1)',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        'file:///etc/passwd',
        'vbscript:msgbox(1)',
        'blob:https://teka.cd/abc',
      ]) {
        expect(isValidBannerLink(v, 'url')).toBe(false);
      }
    });

    it('rejects protocol-relative and backslash-relative targets', () => {
      for (const v of ['//evil.example', '//evil.example/x', '/\\evil.example']) {
        expect(isValidBannerLink(v, 'url')).toBe(false);
      }
    });

    it('rejects plain http (downgrade) and malformed URLs', () => {
      expect(isValidBannerLink('http://example.com/x', 'url')).toBe(false);
      expect(isValidBannerLink('https://', 'url')).toBe(false);
      expect(isValidBannerLink('not a url', 'url')).toBe(false);
    });

    it('rejects control characters and header-injection attempts', () => {
      expect(isValidBannerLink('/categories\nSet-Cookie: a=1', 'url')).toBe(false);
      expect(isValidBannerLink('/categories\r\nX: 1', 'url')).toBe(false);
      expect(isValidBannerLink('/cat egories', 'url')).toBe(false);
      expect(isValidBannerLink('https://teka.cd/ ', 'url')).toBe(false);
    });

    it('accepts a site-relative path and any absolute https URL', () => {
      expect(isValidBannerLink('/categories', 'url')).toBe(true);
      expect(isValidBannerLink('/lubumbashi/categorie/mode', 'url')).toBe(true);
      expect(isValidBannerLink('https://teka.cd/promotions', 'url')).toBe(true);
      expect(isValidBannerLink('https://partner.example/campagne?a=1', 'url')).toBe(true);
    });

    it('rejects a value over the 500-character bound', () => {
      expect(isValidBannerLink('/' + 'a'.repeat(499), 'url')).toBe(true);
      expect(isValidBannerLink('/' + 'a'.repeat(500), 'url')).toBe(false);
    });
  });

  describe('identifier link types', () => {
    it('accepts plain slugs, short codes and UUIDs', () => {
      for (const v of [
        'mode',
        'chemise-bleue-h0d799',
        'h0d799',
        '16000000-0000-0000-0000-000000050102',
      ]) {
        expect(isValidBannerLink(v, 'product')).toBe(true);
        expect(isValidBannerLink(v, 'category')).toBe(true);
        expect(isValidBannerLink(v, 'promotion')).toBe(true);
      }
    });

    it('rejects URLs, schemes, traversal and slashes in an identifier', () => {
      for (const v of [
        'javascript:alert(1)',
        'https://evil.example',
        '//evil.example',
        '../../etc/passwd',
        'mode/../admin',
        '/categories',
      ]) {
        expect(isValidBannerLink(v, 'product')).toBe(false);
        expect(isValidBannerLink(v, 'category')).toBe(false);
      }
    });
  });

  it('with no linkType only a site-relative path is meaningful', () => {
    expect(isValidBannerLink('/categories', undefined)).toBe(true);
    expect(isValidBannerLink('https://teka.cd/x', undefined)).toBe(false);
    expect(isValidBannerLink('javascript:alert(1)', undefined)).toBe(false);
  });

  it('empty, null and undefined stay valid — the field is optional', () => {
    expect(isValidBannerLink(undefined, 'url')).toBe(true);
    expect(isValidBannerLink(null, 'url')).toBe(true);
    expect(isValidBannerLink('', 'url')).toBe(true);
  });

  it('a non-string value is refused', () => {
    expect(isValidBannerLink(42 as unknown, 'url')).toBe(false);
    expect(isValidBannerLink({} as unknown, 'url')).toBe(false);
  });
});
