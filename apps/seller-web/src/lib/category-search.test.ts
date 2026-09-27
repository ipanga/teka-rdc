import { describe, expect, it } from 'vitest';
import {
  isSearchableQuery,
  localCategoryMatches,
  normalizeCategoryQuery,
  resolveServerHits,
} from './category-search';

const leaves = [
  { id: 'lessive', label: 'Lessive', parentLabel: 'Supermarché › Entretien Maison' },
  { id: 'javel', label: 'Javel', parentLabel: 'Supermarché › Entretien Maison' },
  { id: 'alim-bebe', label: 'Alimentation bébé', parentLabel: 'Supermarché › Bébé' },
];

describe('category search (seller-web)', () => {
  it('normalizes accents, case and punctuation', () => {
    expect(normalizeCategoryQuery('  Hygiène & Œufs ')).toBe('hygiene oeufs');
  });

  it('asks the server only for 2+ meaningful characters', () => {
    expect(isSearchableQuery('o')).toBe(false);
    expect(isSearchableQuery(' ! ')).toBe(false);
    expect(isSearchableQuery('om')).toBe(true);
  });

  it('local fallback matches every word against name + path', () => {
    expect(localCategoryMatches(leaves, 'bebe').map((n) => n.id)).toEqual(['alim-bebe']);
    expect(localCategoryMatches(leaves, 'maison javel').map((n) => n.id)).toEqual(['javel']);
    expect(localCategoryMatches(leaves, '').map((n) => n.id)).toHaveLength(3);
  });

  it('keeps the server ranking and drops hits the picker does not know', () => {
    const hits = [
      { id: 'javel', name: 'Javel', path: [] },
      { id: 'gone', name: 'Retirée', path: [] },
      { id: 'lessive', name: 'Lessive', path: [] },
    ];
    expect(resolveServerHits(leaves, hits).map((n) => n.id)).toEqual(['javel', 'lessive']);
  });
});
