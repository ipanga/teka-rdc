import { describe, it, expect } from 'vitest';
import {
  productTail,
  productHref,
  cityHref,
  categoryHref,
  productIdentifierFromParam,
} from './urls';

describe('urls', () => {
  describe('productTail / productHref', () => {
    it('builds /{ville}/{slug}-{shortCode} when all present', () => {
      const p = { id: 'u1', slug: 'iphone-15-pro-max', shortCode: 'a1b2c3', citySlug: 'lubumbashi' };
      expect(productTail(p)).toBe('iphone-15-pro-max-a1b2c3');
      expect(productHref(p)).toBe('/lubumbashi/iphone-15-pro-max-a1b2c3');
    });

    it('uses bare shortCode when slug missing', () => {
      expect(productHref({ id: 'u1', shortCode: 'a1b2c3', citySlug: 'kolwezi' })).toBe(
        '/kolwezi/a1b2c3',
      );
    });

    it('emits a flat URL (no city) for legacy/unscoped rows', () => {
      expect(productHref({ id: 'u1', slug: 'x', shortCode: 'a1b2c3' })).toBe('/x-a1b2c3');
    });

    it('falls back to slug then id when no shortCode', () => {
      expect(productHref({ id: 'u1', slug: 'old-slug', citySlug: 'lubumbashi' })).toBe(
        '/lubumbashi/old-slug',
      );
      expect(productHref({ id: 'u1', citySlug: 'lubumbashi' })).toBe('/lubumbashi/u1');
    });
  });

  describe('cityHref', () => {
    it('builds /{citySlug}', () => {
      expect(cityHref('lubumbashi')).toBe('/lubumbashi');
    });
  });

  describe('categoryHref', () => {
    it('builds city-scoped category URL', () => {
      expect(categoryHref('lubumbashi', { id: 'c1', slug: 'telephones' })).toBe(
        '/lubumbashi/categorie/telephones',
      );
    });
    it('falls back to global /categorie when no city', () => {
      expect(categoryHref(null, { id: 'c1', slug: 'telephones' })).toBe('/categorie/telephones');
    });
    it('falls back to legacy /categories/{id} when category has no slug', () => {
      expect(categoryHref('lubumbashi', { id: 'c1', slug: null })).toBe('/categories/c1');
    });
  });

  describe('productIdentifierFromParam', () => {
    it('extracts the shortCode tail from a full slug-code segment', () => {
      expect(productIdentifierFromParam('iphone-15-pro-max-a1b2c3')).toBe('a1b2c3');
    });
    it('returns a bare shortCode unchanged', () => {
      expect(productIdentifierFromParam('a1b2c3')).toBe('a1b2c3');
    });
    it('passes a UUID through whole (no 6-char tail)', () => {
      const uuid = '31000000-0000-0000-0000-000000000001';
      expect(productIdentifierFromParam(uuid)).toBe(uuid);
    });
    it('returns the whole legacy slug when the tail is not a 6-char code', () => {
      expect(productIdentifierFromParam('telephones-et-electronique')).toBe(
        'telephones-et-electronique',
      );
    });
  });
});
