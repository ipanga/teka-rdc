import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

/**
 * P3-3 — admin category-tree transitions (2026-09-11).
 *
 * Teka's taxonomy is deliberately admin-manageable, so this suite proves BOTH
 * halves of the requirement: the four unsafe structural transitions are refused
 * with an actionable French 400 that writes nothing, and every legitimate admin
 * operation still succeeds untouched.
 *
 * The fixture mirrors the shape the 2026-09-11 development probe used:
 *
 *   root ── sub ── leafA, leafB        `sub` carries 1 HIDDEN historical row
 *        ├─ emptySub                   level-2 leaf, nothing on it
 *        ├─ attrSub                    level-2 leaf, 2 characteristics
 *        └─ prodSub                    level-2 leaf, 3 products
 */
const TREE = [
  { id: 'root', name: 'Mode', parentCategoryId: null },
  { id: 'sub', name: 'Homme', parentCategoryId: 'root' },
  { id: 'leafA', name: 'Chemises', parentCategoryId: 'sub' },
  { id: 'leafB', name: 'Pantalons', parentCategoryId: 'sub' },
  { id: 'emptySub', name: 'Accessoires', parentCategoryId: 'root' },
  { id: 'attrSub', name: 'Chaussures', parentCategoryId: 'root' },
  { id: 'prodSub', name: 'Sacs', parentCategoryId: 'root' },
];

const ATTRIBUTES: Record<string, number> = { sub: 1, leafA: 3, attrSub: 2 };
const PRODUCTS: Record<string, number> = { prodSub: 3, leafA: 1 };

function makeService(overrides: { tree?: typeof TREE } = {}) {
  const tree = overrides.tree ?? TREE;

  const create = jest.fn().mockImplementation((args) => ({ id: 'new', ...args.data }));
  const update = jest.fn().mockImplementation((args) => ({ id: args.where.id, ...args.data }));
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });

  const prisma = {
    category: {
      findMany: jest.fn().mockImplementation((args: { where?: { parentCategoryId?: unknown } }) => {
        // loadStructure() asks for every live node; findTree() asks for roots.
        if (args?.where && 'parentCategoryId' in args.where) {
          return Promise.resolve(tree.filter((c) => c.parentCategoryId === null));
        }
        return Promise.resolve(tree);
      }),
      findUnique: jest.fn().mockImplementation((args: { where: { id: string } }) => {
        const found = tree.find((c) => c.id === args.where.id);
        if (!found) return Promise.resolve(null);
        // softDelete() asks with `include`, so hand back a subtree too.
        return Promise.resolve({
          ...found,
          subcategories: tree
            .filter((c) => c.parentCategoryId === found.id)
            .map((c) => ({ id: c.id, subcategories: tree.filter((g) => g.parentCategoryId === c.id) })),
        });
      }),
      create,
      update,
      updateMany,
    },
    productAttribute: {
      count: jest.fn().mockImplementation((args: { where: { categoryId: string } }) =>
        Promise.resolve(ATTRIBUTES[args.where.categoryId] ?? 0),
      ),
    },
    product: {
      count: jest.fn().mockImplementation((args: { where: { categoryId: string } }) =>
        Promise.resolve(PRODUCTS[args.where.categoryId] ?? 0),
      ),
      // The delete guard's own check — kept empty so it never masks a structural refusal.
      groupBy: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockImplementation((cb: (t: unknown) => unknown) =>
      typeof cb === 'function'
        ? cb({ product: { groupBy: jest.fn().mockResolvedValue([]) }, category: { updateMany } })
        : Promise.resolve([]),
    ),
  };

  return { service: new CategoriesService(prisma as never), prisma, create, update, updateMany };
}

const failure = async (fn: () => Promise<unknown>): Promise<BadRequestException> => {
  try {
    await fn();
  } catch (e) {
    return e as BadRequestException;
  }
  throw new Error('expected the operation to be refused, but it succeeded');
};

/** Nothing may be written when an operation is refused. */
const wroteNothing = (h: ReturnType<typeof makeService>) => {
  expect(h.create).not.toHaveBeenCalled();
  expect(h.update).not.toHaveBeenCalled();
  expect(h.updateMany).not.toHaveBeenCalled();
};

// ---------------------------------------------------------------------------
describe('A. LEAF → INTERMEDIATE', () => {
  it('REFUSES creating a child under a leaf that serves characteristics', async () => {
    const h = makeService();
    const err = await failure(() => h.service.create({ name: 'Baskets', parentCategoryId: 'attrSub' } as never));
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toContain('« Chaussures »');
    expect(err.message).toContain('2 caractéristique(s)');
    wroteNothing(h);
  });

  it('REFUSES creating a child under a leaf that directly holds products', async () => {
    const h = makeService();
    const err = await failure(() => h.service.create({ name: 'Sacs à dos', parentCategoryId: 'prodSub' } as never));
    expect(err.message).toContain('3 produit(s)');
    wroteNothing(h);
  });

  it('REFUSES re-parenting a node UNDER such a leaf', async () => {
    const h = makeService();
    const err = await failure(() => h.service.update('emptySub', { parentCategoryId: 'attrSub' }));
    expect(err.message).toContain('« Chaussures »');
    wroteNothing(h);
  });

  it('ALLOWS creating a child under an EMPTY leaf — subdividing is legitimate', async () => {
    const h = makeService();
    await h.service.create({ name: 'Ceintures', parentCategoryId: 'emptySub' } as never);
    expect(h.create).toHaveBeenCalled();
  });

  it('ALLOWS creating another child under an ALREADY intermediate node', async () => {
    const h = makeService();
    await h.service.create({ name: 'Vestes', parentCategoryId: 'sub' } as never);
    expect(h.create).toHaveBeenCalled();
  });

  it('ALLOWS creating a new TOP-LEVEL category', async () => {
    const h = makeService();
    await h.service.create({ name: 'Sport' } as never);
    expect(h.create).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('B. INTERMEDIATE → LEAF', () => {
  it('REFUSES deleting the LAST child of a node holding historical characteristics', async () => {
    // `sub` has leafA + leafB; delete leafA first so leafB is the last one.
    const tree = TREE.filter((c) => c.id !== 'leafA');
    const h = makeService({ tree });
    const err = await failure(() => h.service.softDelete('leafB'));
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toContain('« Homme »');
    expect(err.message).toContain('1 caractéristique(s) historique(s)');
    expect(err.message).toContain('de nouveau actives');
    wroteNothing(h);
  });

  it('REFUSES re-parenting the LAST child away from such a node', async () => {
    const tree = TREE.filter((c) => c.id !== 'leafA');
    const h = makeService({ tree });
    const err = await failure(() => h.service.update('leafB', { parentCategoryId: 'root' }));
    expect(err.message).toContain('« Homme »');
    wroteNothing(h);
  });

  it('ALLOWS deleting a child while a SIBLING remains — the node stays intermediate', async () => {
    const h = makeService();
    await h.service.softDelete('leafA');
    expect(h.updateMany).toHaveBeenCalled();
  });

  it('ALLOWS emptying a node that carries NO characteristics', async () => {
    // `emptySub` holds nothing; give it a lone child and remove it.
    const tree = [...TREE, { id: 'only', name: 'Unique', parentCategoryId: 'emptySub' }];
    const h = makeService({ tree });
    await h.service.softDelete('only');
    expect(h.updateMany).toHaveBeenCalled();
  });

  it('ALLOWS deleting a ROOT category — it has no parent to resurrect', async () => {
    const h = makeService({ tree: [{ id: 'lone', name: 'Isolée', parentCategoryId: null }] });
    await h.service.softDelete('lone');
    expect(h.updateMany).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('C. RE-PARENTING — cycles and depth', () => {
  it('REFUSES a category becoming its own parent', async () => {
    const h = makeService();
    const err = await failure(() => h.service.update('root', { parentCategoryId: 'root' }));
    expect(err.message).toContain('sous elle-même');
    wroteNothing(h);
  });

  it('REFUSES a move under its own descendant', async () => {
    const h = makeService();
    const err = await failure(() => h.service.update('root', { parentCategoryId: 'leafA' }));
    expect(err.message).toContain('sous-catégories');
    wroteNothing(h);
  });

  it('REFUSES a move that would push descendants past 3 levels', async () => {
    const h = makeService();
    const err = await failure(() => h.service.update('sub', { parentCategoryId: 'emptySub' }));
    expect(err.message).toContain('4 niveaux');
    wroteNothing(h);
  });

  it('ALLOWS moving a CHILDLESS leaf between subcategories', async () => {
    const h = makeService();
    await h.service.update('leafB', { parentCategoryId: 'emptySub' });
    expect(h.update).toHaveBeenCalled();
  });

  it('ALLOWS promoting a subcategory to the top level', async () => {
    const h = makeService();
    await h.service.update('sub', { parentCategoryId: null } as never);
    expect(h.update).toHaveBeenCalled();
  });

  it('keeps the 404 for a parent that does not exist', async () => {
    const h = makeService();
    await expect(h.service.update('leafB', { parentCategoryId: 'ghost' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    wroteNothing(h);
  });
});

// ---------------------------------------------------------------------------
describe('Admin CRUD that must keep working, untouched', () => {
  it('renames a category without consulting the tree at all', async () => {
    const h = makeService();
    await h.service.update('attrSub', { name: 'Chaussures & Baskets' });
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'attrSub' }, data: { name: 'Chaussures & Baskets' } }),
    );
    expect(h.prisma.category.findMany).not.toHaveBeenCalled();
  });

  it('edits metadata (description, emoji, sortOrder) on a node with characteristics', async () => {
    const h = makeService();
    await h.service.update('attrSub', { description: 'Nouvelle description', emoji: '👟', sortOrder: 4 });
    expect(h.update).toHaveBeenCalled();
    expect(h.prisma.category.findMany).not.toHaveBeenCalled();
  });

  it('deactivates and reactivates a category — isActive never changes leaf-ness', async () => {
    const h = makeService();
    await h.service.update('attrSub', { isActive: false });
    await h.service.update('attrSub', { isActive: true });
    expect(h.update).toHaveBeenCalledTimes(2);
    expect(h.prisma.category.findMany).not.toHaveBeenCalled();
  });

  it('accepts a PATCH that repeats the CURRENT parent as a no-op', async () => {
    const h = makeService();
    await h.service.update('leafA', { parentCategoryId: 'sub', name: 'Chemises homme' });
    expect(h.update).toHaveBeenCalled();
    expect(h.prisma.category.findMany).not.toHaveBeenCalled();
  });

  it('the existing max-depth refusal on create is unchanged', async () => {
    const h = makeService();
    const err = await failure(() => h.service.create({ name: 'Trop bas', parentCategoryId: 'leafA' } as never));
    expect(err.message).toContain('profondeur maximale');
    wroteNothing(h);
  });

  it('the existing DELETE product guard still refuses a category holding products', async () => {
    const h = makeService();
    (h.prisma.$transaction as jest.Mock).mockImplementation((cb: (t: unknown) => unknown) =>
      cb({
        product: { groupBy: jest.fn().mockResolvedValue([{ categoryId: 'leafA', _count: { _all: 2 } }]) },
        category: { updateMany: h.updateMany },
      }),
    );
    const err = await failure(() => h.service.softDelete('leafA'));
    expect(err.message).toContain('2 produit(s) actif(s)');
    expect(h.updateMany).not.toHaveBeenCalled();
  });
});
