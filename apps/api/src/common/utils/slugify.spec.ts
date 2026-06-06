import {
  slugify,
  generateProductSlug,
  generateShortCode,
  isShortCode,
} from './slugify';

describe('slugify utils', () => {
  describe('slugify', () => {
    it('strips accents, lowercases, hyphenates', () => {
      expect(slugify('Téléphones & Électronique')).toBe(
        'telephones-et-electronique',
      );
      expect(slugify('iPhone 15 Pro Max')).toBe('iphone-15-pro-max');
      expect(slugify('Chaussures de sport Nike')).toBe(
        'chaussures-de-sport-nike',
      );
    });

    it('collapses punctuation runs and trims edge hyphens', () => {
      expect(slugify('  --Hello,  World!--  ')).toBe('hello-world');
    });

    it('caps the readable portion at 80 chars', () => {
      expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(80);
    });
  });

  describe('generateProductSlug', () => {
    it('produces a clean, city-independent slug (no city, no id suffix)', () => {
      const slug = generateProductSlug('Samsung Galaxy A56');
      expect(slug).toBe('samsung-galaxy-a56');
      expect(slug).not.toMatch(/lubumbashi|kolwezi/);
      // No trailing -<hex> id suffix like the legacy generator produced.
      expect(slug).not.toMatch(/-[0-9a-f]{6}$/);
    });

    it('is stable for the same title regardless of city', () => {
      expect(generateProductSlug('Xbox Series S 512Go')).toBe(
        generateProductSlug('Xbox Series S 512Go'),
      );
    });
  });

  describe('generateShortCode / isShortCode', () => {
    it('generates 6-char base36 codes that satisfy isShortCode', () => {
      for (let i = 0; i < 200; i++) {
        const code = generateShortCode();
        expect(code).toHaveLength(6);
        expect(code).toMatch(/^[a-z0-9]{6}$/);
        expect(isShortCode(code)).toBe(true);
      }
    });

    it('has high entropy (no constant output)', () => {
      const codes = new Set(
        Array.from({ length: 100 }, () => generateShortCode()),
      );
      // 100 draws from a ~2.2B space: collisions are astronomically unlikely.
      expect(codes.size).toBeGreaterThan(95);
    });

    it('isShortCode rejects non-6-char or non-base36 tokens', () => {
      expect(isShortCode('iphone-15-pro-max')).toBe(false);
      expect(isShortCode('abc')).toBe(false); // too short
      expect(isShortCode('abcdefg')).toBe(false); // too long
      expect(isShortCode('ABCDEF')).toBe(false); // uppercase
      expect(isShortCode('ab_cd1')).toBe(false); // underscore
    });
  });
});
