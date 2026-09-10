import { STRICT_BRANDS, STRICT_CATEGORIES } from '../../../prisma/taxonomy-data';

/**
 * Taxonomy shape guards (2026-09-10).
 *
 * Two defects motivated these. The whole 187-node tree contained exactly one
 * dairy node, « Lait infantile » under Bébé, so everyday milk had nowhere to
 * go — the one real milk product in production had been filed under
 * Boissons > Café. And « Déodorants » existed as two separate rows under two
 * departments, which fragments listings, search and seller classification.
 */
const SUPERMARCHE = STRICT_CATEGORIES.find((c) => c.n === 1)!;
const BEAUTE = STRICT_CATEGORIES.find((c) => c.n === 6)!;
const leaves = STRICT_CATEGORIES.flatMap((c) =>
  c.subs.flatMap((s) => s.types.map((t) => ({ ...t, sub: s.fr, dept: c.fr }))),
);

describe('taxonomy — ordinary milk', () => {
  const dairy = SUPERMARCHE.subs.find((s) => s.n === 106);

  it('ordinary milk has a home OUTSIDE the Bébé branch', () => {
    expect(dairy).toBeDefined();
    expect(dairy!.fr).toBe('Lait & Produits Laitiers');
    expect(dairy!.types.map((t) => t.fr)).toEqual([
      'Lait en poudre',
      'Lait liquide / UHT',
      'Lait concentré / évaporé',
    ]);
  });

  it('infant formula stays separate, under Bébé', () => {
    const bebe = SUPERMARCHE.subs.find((s) => s.n === 105)!;
    expect(bebe.types.map((t) => t.fr)).toContain('Lait infantile');
    // and is NOT duplicated into the ordinary-milk branch
    expect(dairy!.types.map((t) => t.fr)).not.toContain('Lait infantile');
  });

  it('ordinary milk does NOT inherit the infant-formula attribute shape', () => {
    const infant = SUPERMARCHE.subs
      .find((s) => s.n === 105)!
      .types.find((t) => t.fr === 'Lait infantile')!;
    const powder = dairy!.types.find((t) => t.fr === 'Lait en poudre')!;

    const names = (t: typeof powder) => (t.attrs ?? []).map((a) => a.fr);
    expect(names(infant)).toEqual(['Poids', "Date d'expiration"]);
    // Ordinary milk is chosen on form and size, not on weight alone.
    expect(names(powder)).toContain('Forme');
    expect(names(powder)).toContain('Poids / Volume');
    expect(names(powder)).not.toEqual(names(infant));
  });

  it('the tree stays exactly three levels — milk is a SUBCATEGORY, not a 4th level', () => {
    // A fourth level is unrepresentable: ProductTypeDef has no children.
    for (const t of dairy!.types) {
      expect(Object.keys(t)).not.toContain('types');
      expect(Object.keys(t)).not.toContain('subs');
    }
  });
});

describe('taxonomy — deodorants are no longer duplicated', () => {
  it('exactly ONE customer-facing Déodorants leaf exists', () => {
    const found = leaves.filter((l) => l.fr === 'Déodorants');
    expect(found).toHaveLength(1);
    expect(found[0].dept).toBe('Beauté & Santé');
    expect(found[0].sub).toBe('Soins Personnels');
    expect(found[0].n).toBe(60202);
  });

  it('the retired Supermarché leaf is gone from the strict tree', () => {
    expect(leaves.some((l) => l.n === 10304)).toBe(false);
    // Its siblings survive untouched.
    const hygiene = SUPERMARCHE.subs.find((s) => s.n === 103)!;
    expect(hygiene.types.map((t) => t.fr)).toEqual([
      'Savons',
      'Shampoings',
      'Dentifrices',
    ]);
  });

  it('the surviving leaf keeps its brand links and gains real characteristics', () => {
    const brands = STRICT_BRANDS.filter((b) => b.types.includes(60202)).map((b) => b.fr);
    expect(brands).toEqual(expect.arrayContaining(['Nivea', 'Dove']));

    const deo = BEAUTE.subs
      .find((s) => s.n === 602)!
      .types.find((t) => t.n === 60202)!;
    const names = (deo.attrs ?? []).map((a) => a.fr);
    // The applicator is the thing a buyer actually chooses on.
    expect(names).toContain('Format');
    expect(names).toContain('Anti-transpirant');
  });

  it('no brand still points at the retired leaf', () => {
    expect(STRICT_BRANDS.filter((b) => b.types.includes(10304))).toHaveLength(0);
  });
});

describe('taxonomy — alcohol', () => {
  const alcohol = SUPERMARCHE.subs.find((s) => s.n === 107);

  it('an alcohol branch exists, so a spirit no longer has to sit on an intermediate node', () => {
    expect(alcohol).toBeDefined();
    expect(alcohol!.fr).toBe('Boissons Alcoolisées');
    expect(alcohol!.types.map((t) => t.fr)).toEqual(['Bières', 'Vins', 'Spiritueux']);
  });

  it('alcohol is separate from the non-alcoholic Boissons subcategory', () => {
    const boissons = SUPERMARCHE.subs.find((s) => s.n === 102)!;
    expect(boissons.types.map((t) => t.fr)).toEqual([
      'Eau', 'Jus', 'Sodas', 'Café', 'Thé', 'Boissons énergétiques',
    ]);
    expect(boissons.types.some((t) => /bière|vin|spiritueux/i.test(t.fr))).toBe(false);
  });

  it('Spiritueux carries the attributes a buyer actually chooses on', () => {
    const spirit = alcohol!.types.find((t) => t.fr === 'Spiritueux')!;
    const names = (spirit.attrs ?? []).map((a) => a.fr);
    expect(names).toEqual(['Type', 'Volume', "Degré d'alcool", "Pays d'origine"]);
  });

  it('« Marque » is NEVER an attribute — Brand is the first-class entity', () => {
    for (const l of leaves) {
      for (const a of l.attrs ?? []) {
        expect(a.fr).not.toMatch(/^Marque$/i);
      }
    }
  });

  it('Johnnie Walker is offered on Spiritueux, and only there', () => {
    const jw = STRICT_BRANDS.find((b) => b.fr === 'Johnnie Walker');
    expect(jw).toBeDefined();
    expect(jw!.types).toEqual([10703]);
  });

  it('the catch-all brand still links everywhere, so no seller is blocked', () => {
    const autre = STRICT_BRANDS.find((b) => b.fr === 'Autre')!;
    expect(autre.types).toEqual([]);
  });
});

describe('taxonomy — nothing else moved', () => {
  it('every numeric key stays unique', () => {
    const keys = leaves.map((l) => l.n);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('leaf keys still derive from their subcategory (subN*100 + slot)', () => {
    for (const c of STRICT_CATEGORIES) {
      for (const s of c.subs) {
        for (const t of s.types) {
          expect(Math.floor(t.n / 100)).toBe(s.n);
        }
      }
    }
  });

  it('the departments are unchanged', () => {
    expect(STRICT_CATEGORIES.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('every brand links only to leaves that exist', () => {
    const valid = new Set(leaves.map((l) => l.n));
    for (const b of STRICT_BRANDS) {
      for (const t of b.types) {
        expect(valid.has(t)).toBe(true);
      }
    }
  });
});
