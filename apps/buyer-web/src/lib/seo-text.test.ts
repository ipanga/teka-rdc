import { describe, expect, it } from 'vitest';
import { plainText, truncateForMeta } from './seo-text';

describe('plainText', () => {
  it('strips markdown structure a seller typically writes and keeps the words', () => {
    const md = '## Chemise en lin\n\n**Très** légère, *idéale* pour Lubumbashi.\n\n- Taille M\n- Couleur bleue\n\nVoir [la boutique](https://x.cd/shop) `ref 12`.';
    expect(plainText(md)).toBe(
      'Chemise en lin Très légère, idéale pour Lubumbashi. Taille M Couleur bleue Voir la boutique ref 12.',
    );
  });

  it('leaves plain prose untouched apart from whitespace and handles empty input', () => {
    expect(plainText('  Bonjour   le monde \n')).toBe('Bonjour le monde');
    expect(plainText(null)).toBe('');
    expect(plainText(undefined)).toBe('');
  });

  it('never produces markup — the output is safe to put in a meta attribute or JSON-LD', () => {
    const out = plainText('# T\n![img](x.png) **b** [l](u)\n> q');
    expect(out).toBe('T img b l q');
    expect(out).not.toMatch(/[#*\[\]()>`]/);
  });
});

describe('truncateForMeta', () => {
  it('keeps short text as is and cuts long text on a word boundary with an ellipsis', () => {
    expect(truncateForMeta('court', 160)).toBe('court');
    const long = 'mot '.repeat(60).trim();
    const out = truncateForMeta(long, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });
});
