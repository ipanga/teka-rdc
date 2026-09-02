import {
  dedupeSpecificationsByName,
  normalizeCharacteristicName,
} from './product-specifications';

const OWN = '16000000-0000-0000-0000-000000050102'; // Chemises (product's category)
const FOREIGN = '13000000-0000-0000-0000-000000000401'; // Électroménager > Cuisine
const PARENT = '13000000-0000-0000-0000-000000000101'; // Supermarché > Alimentation

const spec = (
  attributeId: string,
  categoryId: string,
  name: string,
  value: string,
  sortOrder = 0,
) => ({ id: `s-${attributeId}`, attributeId, value, attribute: { name, categoryId, sortOrder } });

describe('normalizeCharacteristicName', () => {
  it('collapses case, accents and surrounding whitespace', () => {
    expect(normalizeCharacteristicName('  Matière ')).toBe('matiere');
    expect(normalizeCharacteristicName('MATIERE')).toBe('matiere');
    expect(normalizeCharacteristicName("Date d'expiration")).toBe("date d'expiration");
  });
});

describe('dedupeSpecificationsByName', () => {
  it('keeps a FOREIGN-only characteristic — it is the only source', () => {
    // A 10 kg bag of rice carries « Poids » from its PARENT category. Dropping
    // foreign rows would blank 7 live production products.
    const out = dedupeSpecificationsByName([spec('a', PARENT, 'Poids', '10kg')], OWN);
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('10kg');
  });

  it('keeps a current-category-only characteristic', () => {
    const out = dedupeSpecificationsByName([spec('a', OWN, 'Taille', 'M')], OWN);
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('M');
  });

  it('collapses a duplicate name to one, and the CURRENT category wins', () => {
    const out = dedupeSpecificationsByName(
      [spec('foreign', FOREIGN, 'Taille', 'XXL'), spec('own', OWN, 'Taille', 'M')],
      OWN,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ attributeId: 'own', value: 'M' });
  });

  it('current wins regardless of the order rows arrive in', () => {
    const rows = [spec('own', OWN, 'Taille', 'M'), spec('foreign', FOREIGN, 'Taille', 'XXL')];
    for (const order of [rows, [...rows].reverse()]) {
      const out = dedupeSpecificationsByName(order, OWN);
      expect(out).toHaveLength(1);
      expect(out[0].value).toBe('M');
    }
  });

  it('treats accent/case/whitespace variants as the same characteristic', () => {
    const out = dedupeSpecificationsByName(
      [spec('foreign', FOREIGN, '  matiere ', 'Polyester'), spec('own', OWN, 'Matière', 'Coton')],
      OWN,
    );
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('Coton');
  });

  it('keeps BOTH when a current and a foreign row have different names', () => {
    const out = dedupeSpecificationsByName(
      [spec('own', OWN, 'Taille', 'M'), spec('foreign', PARENT, 'Poids', '1kg')],
      OWN,
    );
    expect(out.map((s) => s.attribute.name).sort()).toEqual(['Poids', 'Taille']);
  });

  it('resolves several FOREIGN rows sharing a name deterministically', () => {
    const rows = [spec('bbb', FOREIGN, 'Type', 'B'), spec('aaa', PARENT, 'Type', 'A')];
    const a = dedupeSpecificationsByName(rows, OWN);
    const b = dedupeSpecificationsByName([...rows].reverse(), OWN);
    expect(a).toHaveLength(1);
    // attributeId is the stable final tiebreaker, so both input orders agree.
    expect(a[0].attributeId).toBe('aaa');
    expect(b[0].attributeId).toBe('aaa');
  });

  it('leaves an ordinary product untouched when nothing collides', () => {
    const rows = [
      spec('a', OWN, 'Taille', 'M', 0),
      spec('b', OWN, 'Couleur', 'Bleu', 1),
      spec('c', OWN, 'Matière', 'Coton', 2),
    ];
    const out = dedupeSpecificationsByName(rows, OWN);
    expect(out.map((s) => s.attribute.name)).toEqual(['Taille', 'Couleur', 'Matière']);
  });

  it('h0d799 remediation state → each characteristic exactly once, Chemises values', () => {
    const out = dedupeSpecificationsByName(
      [
        spec('k1', FOREIGN, 'Taille', 'M'),
        spec('k2', FOREIGN, 'Couleur', 'Bleu'),
        spec('k3', FOREIGN, 'Matière', 'Coton'),
        spec('c1', OWN, 'Taille', 'M', 0),
        spec('c2', OWN, 'Couleur', 'Bleu', 1),
        spec('c3', OWN, 'Matière', 'Coton', 2),
      ],
      OWN,
    );
    expect(out).toHaveLength(3);
    expect(out.map((s) => [s.attribute.name, s.value])).toEqual([
      ['Taille', 'M'],
      ['Couleur', 'Bleu'],
      ['Matière', 'Coton'],
    ]);
    expect(out.map((s) => s.attributeId)).toEqual(['c1', 'c2', 'c3']);
  });

  it('vnkqce remediation state → the legacy Type stays visible', () => {
    const LESSIVE = '16000000-0000-0000-0000-000000010401';
    const out = dedupeSpecificationsByName(
      [spec('legacy', 'soft-deleted-cat', 'Type', 'Savon de lessive')],
      LESSIVE,
    );
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('Savon de lessive');
  });

  it('drops rows with no attribute label rather than rendering them half-empty', () => {
    const rows = [{ id: 'x', attributeId: 'x', value: 'v', attribute: null }];
    expect(dedupeSpecificationsByName(rows, OWN)).toEqual([]);
  });
});
