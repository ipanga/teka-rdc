import {
  CategorySearchLeaf,
  cleanCategoryKeywords,
  normalizeCategoryText,
  searchCategoryLeaves,
} from './category-search';

let order = 0;
const leaf = (
  name: string,
  path: string[],
  keywords: string[] = [],
  brands: string[] = [],
): CategorySearchLeaf => ({
  id: name,
  name,
  path: [...path, name],
  keywords,
  brands,
  treeOrder: order++,
});

// A slice of the real taxonomy, in tree order.
const LEAVES: CategorySearchLeaf[] = [
  leaf('Céréales', ['Supermarché', 'Alimentation'], [], ['Nestlé']),
  leaf('Savons', ['Supermarché', 'Hygiène Personnelle'], ['savon de toilette'], ['Dove', 'Lux']),
  leaf(
    'Lessive',
    ['Supermarché', 'Entretien Maison'],
    ['lessive poudre', 'lessive en poudre', 'poudre à lessiver', 'savon poudre', 'savon en poudre', 'détergent', 'linge'],
    ['Omo', 'Ariel', 'Boom'],
  ),
  leaf('Détergents', ['Supermarché', 'Entretien Maison'], [], ['Ariel']),
  leaf('Désinfectants', ['Supermarché', 'Entretien Maison'], [], ['Dettol']),
  leaf('Couches', ['Supermarché', 'Bébé'], [], ['Pampers']),
  leaf('Lait infantile', ['Supermarché', 'Bébé'], ['lait bébé'], ['Nestlé']),
  leaf(
    'Alimentation bébé',
    ['Supermarché', 'Bébé'],
    ['céréales bébé', 'céréales infantiles', 'bouillie bébé', 'farine bébé', 'nestlé cerelac', 'cerelac'],
    ['Cerelac', 'Nestlé'],
  ),
  leaf('Gels douche & Savons', ['Beauté & Santé', 'Soins Personnels'], [], ['Dove']),
];

const ids = (q: string) => searchCategoryLeaves(q, LEAVES).map((h) => h.id);

describe('normalizeCategoryText', () => {
  it('folds accents, case, punctuation and whitespace', () => {
    expect(normalizeCategoryText('  Hygiène   Personnelle ')).toBe('hygiene personnelle');
    expect(normalizeCategoryText('Gels douche & Savons')).toBe('gels douche savons');
    expect(normalizeCategoryText("Poudre à lessiver")).toBe('poudre a lessiver');
    expect(normalizeCategoryText('Œufs')).toBe('oeufs');
  });
});

describe('searchCategoryLeaves', () => {
  it('omo / boom / ariel → Lessive through the linked brands', () => {
    expect(ids('omo')[0]).toBe('Lessive');
    expect(ids('Boom')[0]).toBe('Lessive');
    expect(ids('ARIEL')).toEqual(['Lessive', 'Détergents']);
  });

  it('« savon poudre » favours Lessive over the soap leaves', () => {
    expect(ids('savon poudre')).toEqual(['Lessive']);
    expect(ids('savon en poudre')[0]).toBe('Lessive');
  });

  it('« detergent » ranks the Détergents leaf first, Lessive (alias) next', () => {
    expect(ids('detergent')).toEqual(['Détergents', 'Lessive']);
  });

  it('cerelac → Alimentation bébé; « nestle cerelac » too', () => {
    expect(ids('cerelac')[0]).toBe('Alimentation bébé');
    expect(ids('nestle cerelac')[0]).toBe('Alimentation bébé');
  });

  it('« bebe » finds the Bébé leaves, a name match first', () => {
    expect(ids('bebe')).toEqual([
      'Alimentation bébé', // name contains « bébé »
      'Lait infantile', // alias « lait bébé »
      'Couches', // path
    ]);
  });

  it('is accent-, case- and whitespace-insensitive and folds plurals', () => {
    expect(ids('cereales')[0]).toBe('Céréales');
    expect(ids('  CÉRÉALE ')[0]).toBe('Céréales');
    expect(ids('hygiene')).toContain('Savons');
    expect(ids('savons')[0]).toBe('Savons');
    expect(ids('savon')[0]).toBe('Savons');
  });

  it('prefix-matches while the seller is still typing', () => {
    expect(ids('less')[0]).toBe('Lessive');
    expect(ids('desinf')).toEqual(['Désinfectants']);
  });

  it('ranks exact name > name > exact alias > alias > brand > path', () => {
    const hits = searchCategoryLeaves('lessive', LEAVES);
    expect(hits[0]).toMatchObject({ id: 'Lessive', matchedBy: 'name' });
    expect(searchCategoryLeaves('linge', LEAVES)[0]).toMatchObject({
      id: 'Lessive',
      matchedBy: 'keyword',
    });
    expect(searchCategoryLeaves('dettol', LEAVES)[0]).toMatchObject({
      id: 'Désinfectants',
      matchedBy: 'brand',
    });
    expect(searchCategoryLeaves('entretien', LEAVES)[0]).toMatchObject({
      id: 'Lessive',
      matchedBy: 'path',
    });
  });

  it('is deterministic: ties follow the tree order', () => {
    // Both Bébé leaves reached by path only keep tree order.
    const hits = ids('supermarche bebe');
    expect(hits).toEqual(['Couches', 'Lait infantile', 'Alimentation bébé']);
    expect(ids('supermarche bebe')).toEqual(hits);
  });

  it('returns nothing for a too-short or empty query, or no match', () => {
    expect(ids('')).toEqual([]);
    expect(ids(' a ')).toEqual([]);
    expect(ids('!!')).toEqual([]);
    expect(ids('tondeuse')).toEqual([]);
  });

  it('works for leaves without aliases or brands', () => {
    const bare = [leaf('Javel', ['Supermarché', 'Entretien Maison'])];
    expect(searchCategoryLeaves('javel', bare).map((h) => h.id)).toEqual(['Javel']);
  });

  it('never returns more than the limit', () => {
    expect(searchCategoryLeaves('supermarche', LEAVES, 3)).toHaveLength(3);
  });
});

describe('cleanCategoryKeywords', () => {
  it('trims, collapses spaces, drops empties and normalized duplicates', () => {
    expect(
      cleanCategoryKeywords(['  Savon   poudre ', 'savon poudre', 'SAVON POUDRE', '', '  ', 'Détergent', 'detergent']),
    ).toEqual(['Savon poudre', 'Détergent']);
  });

  it('keeps an empty list empty', () => {
    expect(cleanCategoryKeywords([])).toEqual([]);
  });
});
