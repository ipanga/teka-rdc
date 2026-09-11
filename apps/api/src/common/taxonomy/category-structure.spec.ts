import {
  MAX_CATEGORY_DEPTH,
  buildCategoryStructure,
  childCountOf,
  depthOf,
  isSelfOrDescendant,
  refuseCyclicReparent,
  refuseDepthOverflow,
  refuseGainingFirstChild,
  refuseLosingLastChild,
  subtreeHeightOf,
  type StructureNode,
} from './category-structure';

/**
 * P3-3 — structural safety for admin category-tree edits.
 *
 * Each block pins ONE side of a decision boundary: the unsafe case must be
 * refused, and the adjacent legitimate case must be allowed. A guard that only
 * ever says no would pass half of these and fail the other half, which is the
 * point — the product requirement is that admin category management keeps
 * working.
 */

const node = (id: string, name: string, parentCategoryId: string | null = null): StructureNode => ({
  id,
  name,
  parentCategoryId,
});

//        root
//        ├── sub ────── leafA, leafB
//        ├── emptySub          (level-2 leaf, nothing on it)
//        └── deep ───── mid ── bottom   (deliberately 4 levels tall, so the
//                                        depth guard has something to refuse)
const NODES = [
  node('root', 'Mode'),
  node('sub', 'Homme', 'root'),
  node('leafA', 'Chemises', 'sub'),
  node('leafB', 'Pantalons', 'sub'),
  node('emptySub', 'Accessoires', 'root'),
  node('deep', 'Maison', 'root'),
  node('mid', 'Cuisine', 'deep'),
  node('bottom', 'Casseroles', 'mid'),
];
const S = buildCategoryStructure(NODES);

describe('category structure — indexing', () => {
  it('counts children exactly as the runtime does', () => {
    expect(childCountOf(S, 'sub')).toBe(2);
    expect(childCountOf(S, 'leafA')).toBe(0);
    expect(childCountOf(S, 'root')).toBe(3);
  });

  it('reports 1-based depth', () => {
    expect(depthOf(S, 'root')).toBe(1);
    expect(depthOf(S, 'sub')).toBe(2);
    expect(depthOf(S, 'leafA')).toBe(3);
  });

  it('reports subtree height, 1 for a childless node', () => {
    expect(subtreeHeightOf(S, 'leafA')).toBe(1);
    expect(subtreeHeightOf(S, 'sub')).toBe(2);
    // root → deep → mid → bottom: the fixture is over-deep on purpose.
    expect(subtreeHeightOf(S, 'root')).toBe(4);
    expect(subtreeHeightOf(S, 'deep')).toBe(3);
  });

  it('recognises self and descendants, and rejects unrelated nodes', () => {
    expect(isSelfOrDescendant(S, 'root', 'root')).toBe(true);
    expect(isSelfOrDescendant(S, 'leafA', 'root')).toBe(true);
    expect(isSelfOrDescendant(S, 'leafA', 'sub')).toBe(true);
    expect(isSelfOrDescendant(S, 'emptySub', 'sub')).toBe(false);
    expect(isSelfOrDescendant(S, 'root', 'sub')).toBe(false);
  });

  it('survives a tree that ALREADY contains a cycle instead of looping forever', () => {
    const cyclic = buildCategoryStructure([
      node('a', 'A', 'b'),
      node('b', 'B', 'a'),
    ]);
    expect(depthOf(cyclic, 'a')).toBeLessThanOrEqual(3);
    expect(subtreeHeightOf(cyclic, 'a')).toBeLessThanOrEqual(3);
    expect(isSelfOrDescendant(cyclic, 'a', 'zzz')).toBe(false);
  });
});

describe('GUARD A — a leaf must not silently become an intermediate node', () => {
  const leaf = node('leafA', 'Chemises', 'sub');

  it('REFUSES when the leaf serves characteristics', () => {
    const r = refuseGainingFirstChild(leaf, 0, 3, 0);
    expect(r?.code).toBe('LEAF_WITH_ATTRIBUTES');
    expect(r?.message).toContain('« Chemises »');
    expect(r?.message).toContain('3 caractéristique(s)');
  });

  it('REFUSES when the leaf directly holds products', () => {
    const r = refuseGainingFirstChild(leaf, 0, 0, 4);
    expect(r?.code).toBe('LEAF_WITH_PRODUCTS');
    expect(r?.message).toContain('4 produit(s)');
  });

  it('names the characteristics first when both apply — that is what must move', () => {
    expect(refuseGainingFirstChild(leaf, 0, 3, 4)?.code).toBe('LEAF_WITH_ATTRIBUTES');
  });

  it('ALLOWS subdividing an empty leaf — a normal taxonomy extension', () => {
    expect(refuseGainingFirstChild(leaf, 0, 0, 0)).toBeNull();
  });

  it('ALLOWS a node that is ALREADY intermediate to gain another child', () => {
    // Nothing changes: its characteristics are hidden before and after.
    expect(refuseGainingFirstChild(leaf, 2, 3, 4)).toBeNull();
  });

  it('the refusal tells the admin what to do, not merely that it failed', () => {
    const r = refuseGainingFirstChild(leaf, 0, 3, 0);
    expect(r?.message).toContain('Déplacez');
    expect(r?.message).toMatch(/type de produit/);
  });

  it('never leaks an id, a table name or English wording', () => {
    const r = refuseGainingFirstChild(leaf, 0, 3, 0);
    expect(r?.message).not.toContain('leafA');
    expect(r?.message).not.toMatch(/prisma|categor(y|ies)\b|attribute/i);
  });
});

describe('GUARD B — hidden historical characteristics must not come back to life', () => {
  const parent = node('mid', 'Cuisine', 'deep');

  it('REFUSES removing the LAST child of a node that still carries characteristics', () => {
    const r = refuseLosingLastChild(parent, 0, 3);
    expect(r?.code).toBe('INTERMEDIATE_WITH_HIDDEN_ATTRIBUTES');
    expect(r?.message).toContain('« Cuisine »');
    expect(r?.message).toContain('3 caractéristique(s) historique(s)');
  });

  it('ALLOWS it while another child remains — the node stays intermediate', () => {
    expect(refuseLosingLastChild(parent, 1, 3)).toBeNull();
  });

  it('ALLOWS a node with NO characteristics to become a product type', () => {
    // Simplifying the taxonomy is legitimate; there is nothing to resurrect.
    expect(refuseLosingLastChild(parent, 0, 0)).toBeNull();
  });

  it('explains WHY, and what must change first', () => {
    const r = refuseLosingLastChild(parent, 0, 1);
    expect(r?.message).toContain('de nouveau actives');
    expect(r?.message).toMatch(/Déplacez ou supprimez/);
  });
});

describe('GUARD C — no cycles', () => {
  it('REFUSES a category becoming its own parent', () => {
    expect(refuseCyclicReparent(S, 'root', 'root')?.code).toBe('CYCLE');
  });

  it('REFUSES a move under a direct child', () => {
    expect(refuseCyclicReparent(S, 'root', 'sub')?.code).toBe('CYCLE');
  });

  it('REFUSES a move under a deeper descendant', () => {
    expect(refuseCyclicReparent(S, 'root', 'leafA')?.code).toBe('CYCLE');
  });

  it('ALLOWS a move under an unrelated branch', () => {
    expect(refuseCyclicReparent(S, 'leafA', 'emptySub')).toBeNull();
    expect(refuseCyclicReparent(S, 'sub', 'deep')).toBeNull();
  });
});

describe('GUARD D — the moved subtree must still fit inside 3 levels', () => {
  it('REFUSES a move that would push descendants to level 4', () => {
    // `sub` is 2 levels tall; under `emptySub` (level 2) its leaves land at 4.
    const r = refuseDepthOverflow(S, 'sub', 'emptySub');
    expect(r?.code).toBe('DEPTH_EXCEEDED');
    expect(r?.message).toContain('4 niveaux');
    expect(r?.message).toContain(String(MAX_CATEGORY_DEPTH));
  });

  it('ALLOWS moving a CHILDLESS node to the same place — height is what matters', () => {
    expect(refuseDepthOverflow(S, 'leafA', 'emptySub')).toBeNull();
  });

  it('ALLOWS promoting a tall subtree to the root', () => {
    expect(refuseDepthOverflow(S, 'sub', null)).toBeNull();
    expect(refuseDepthOverflow(S, 'deep', null)).toBeNull();
  });

  it('REFUSES a 3-level subtree moved under a root — that is 4 levels', () => {
    // `deep` is 3 tall; under `root` (level 1) its bottom lands at 4.
    expect(refuseDepthOverflow(S, 'deep', 'root')?.code).toBe('DEPTH_EXCEEDED');
  });

  it('ALLOWS the ordinary sideways move of a leaf between subcategories', () => {
    expect(refuseDepthOverflow(S, 'leafA', 'deep')).toBeNull();
  });

  it('counts the TARGET depth, not the source depth', () => {
    // Moving `mid` (height 2, currently level 2) under `sub` (level 2) → level 4.
    expect(refuseDepthOverflow(S, 'mid', 'sub')?.code).toBe('DEPTH_EXCEEDED');
    // …but under `root` (level 1) it fits exactly.
    expect(refuseDepthOverflow(S, 'mid', 'root')).toBeNull();
  });
});

/**
 * MUTATION TESTS — each asserts the SPECIFIC condition that makes the guard
 * correct, so an implementation that drops it goes red rather than merely
 * returning a refusal for the wrong reason.
 */
describe('mutation resistance', () => {
  it('GUARD A that ignored the child count would wrongly refuse an existing intermediate', () => {
    // If `currentChildCount > 0 → null` were removed, this would return a refusal.
    expect(refuseGainingFirstChild(node('x', 'X'), 5, 9, 9)).toBeNull();
  });

  it('GUARD B that ignored the attribute count would wrongly refuse an empty node', () => {
    // If `attributeCount === 0 → null` were removed, this would return a refusal.
    expect(refuseLosingLastChild(node('x', 'X'), 0, 0)).toBeNull();
  });

  it('GUARD B that ignored the remaining child count would fire on every delete', () => {
    expect(refuseLosingLastChild(node('x', 'X'), 3, 5)).toBeNull();
  });

  it('GUARD D that used the parent depth alone would miss the overflow', () => {
    // `emptySub` is level 2, so a parent-only check (depth ≤ 2) passes it.
    expect(depthOf(S, 'emptySub')).toBe(2);
    // The real check still refuses, because the SUBTREE is 2 tall.
    expect(refuseDepthOverflow(S, 'sub', 'emptySub')?.code).toBe('DEPTH_EXCEEDED');
  });

  it('GUARD C that compared ids only would miss an indirect descendant', () => {
    expect('root').not.toBe('leafA');
    expect(refuseCyclicReparent(S, 'root', 'leafA')?.code).toBe('CYCLE');
  });

  it('every refusal message is French and non-empty', () => {
    const all = [
      refuseGainingFirstChild(node('x', 'X'), 0, 1, 0),
      refuseGainingFirstChild(node('x', 'X'), 0, 0, 1),
      refuseLosingLastChild(node('x', 'X'), 0, 1),
      refuseCyclicReparent(S, 'root', 'sub'),
      refuseDepthOverflow(S, 'deep', 'root'),
    ];
    for (const r of all) {
      expect(r).not.toBeNull();
      expect(r!.message.length).toBeGreaterThan(40);
      expect(r!.message).not.toMatch(/[a-z]+_[A-Z]+|undefined|NaN/);
    }
  });
});
