import { describe, it, expect } from 'vitest';
import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it('returns / for null / undefined / empty', () => {
    expect(safeRedirect(null)).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
    expect(safeRedirect('')).toBe('/');
  });

  it('allows same-origin relative paths (incl. query)', () => {
    expect(safeRedirect('/produit-x')).toBe('/produit-x');
    expect(safeRedirect('/wishlist')).toBe('/wishlist');
    expect(safeRedirect('/categorie/abc?x=1')).toBe('/categorie/abc?x=1');
  });

  it('blocks open-redirects', () => {
    expect(safeRedirect('//evil.com')).toBe('/');
    expect(safeRedirect('/\\evil.com')).toBe('/');
    expect(safeRedirect('https://evil.com')).toBe('/');
    expect(safeRedirect('evil.com')).toBe('/');
    expect(safeRedirect('javascript:alert(1)')).toBe('/');
  });
});
