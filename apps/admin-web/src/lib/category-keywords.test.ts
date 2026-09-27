import { describe, expect, it } from 'vitest';
import {
  formatKeywordInput,
  keywordInputError,
  parseKeywordInput,
} from './category-keywords';

describe('parseKeywordInput', () => {
  it('splits on new lines, commas and semicolons, trims and collapses spaces', () => {
    expect(parseKeywordInput('omo,  boom\n savon   poudre ;ariel\n\n')).toEqual([
      'omo',
      'boom',
      'savon poudre',
      'ariel',
    ]);
  });

  it('merges duplicates that differ by case or accents, keeping the first spelling', () => {
    expect(parseKeywordInput('Céréales bébé\ncereales bebe\nCEREALES BEBE')).toEqual([
      'Céréales bébé',
    ]);
  });

  it('returns an empty list for blank input', () => {
    expect(parseKeywordInput('  \n , ')).toEqual([]);
  });
});

describe('formatKeywordInput', () => {
  it('round-trips one alias per line and tolerates missing data', () => {
    expect(formatKeywordInput(['omo', 'savon poudre'])).toBe('omo\nsavon poudre');
    expect(formatKeywordInput(undefined)).toBe('');
    expect(parseKeywordInput(formatKeywordInput(['a b', 'c']))).toEqual(['a b', 'c']);
  });
});

describe('keywordInputError', () => {
  it('mirrors the API bounds', () => {
    expect(keywordInputError(['omo'])).toBeNull();
    expect(keywordInputError(['o'])).toContain('entre 2 et 60');
    expect(keywordInputError(Array.from({ length: 41 }, (_, i) => `t${i}`))).toContain('40');
  });
});
