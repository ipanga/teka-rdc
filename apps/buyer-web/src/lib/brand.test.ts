import { describe, expect, it } from 'vitest';
import { isRealBrand } from './brand';

describe('isRealBrand (SEO-2 — no placeholder Brand in structured data)', () => {
  it('accepts a real brand and rejects the « Autre » placeholder, empties and nulls', () => {
    expect(isRealBrand({ name: 'Samsung' })).toBe(true);
    expect(isRealBrand({ name: 'Autre' })).toBe(false);
    expect(isRealBrand({ name: ' autre ' })).toBe(false);
    expect(isRealBrand({ name: '' })).toBe(false);
    expect(isRealBrand(null)).toBe(false);
    expect(isRealBrand(undefined)).toBe(false);
  });
});
