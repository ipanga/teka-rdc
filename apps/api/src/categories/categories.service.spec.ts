import { BadRequestException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

function makeService(existingAttrIds: string[]) {
  const prisma = {
    productAttribute: {
      findMany: jest
        .fn()
        // 1st call: existence check (select id). 2nd call: final ordered fetch.
        .mockResolvedValueOnce(existingAttrIds.map((id) => ({ id })))
        .mockResolvedValue(
          existingAttrIds.map((id, i) => ({ id, sortOrder: i })),
        ),
      update: jest.fn().mockImplementation((args) => args),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const service = new CategoriesService(prisma as never);
  return { service, prisma };
}

describe('CategoriesService.reorderAttributes', () => {
  it('writes sortOrder = index for each id in order', async () => {
    const { service, prisma } = makeService(['a', 'b', 'c']);

    await service.reorderAttributes('cat1', ['c', 'a', 'b']);

    // One update per attribute, sortOrder following the new order.
    const txArg = prisma.$transaction.mock.calls[0][0];
    expect(txArg).toHaveLength(3);
    expect(prisma.productAttribute.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'c' },
      data: { sortOrder: 0 },
    });
    expect(prisma.productAttribute.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'a' },
      data: { sortOrder: 1 },
    });
    expect(prisma.productAttribute.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'b' },
      data: { sortOrder: 2 },
    });
  });

  it('rejects a list that is missing an attribute', async () => {
    const { service, prisma } = makeService(['a', 'b', 'c']);
    await expect(
      service.reorderAttributes('cat1', ['a', 'b']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a list containing a foreign attribute id', async () => {
    const { service, prisma } = makeService(['a', 'b', 'c']);
    await expect(
      service.reorderAttributes('cat1', ['a', 'b', 'x']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

function makeCatService(nodes: Array<{ id: string; parentCategoryId: string | null }>) {
  const prisma = {
    category: {
      findMany: jest.fn().mockResolvedValue(nodes),
      update: jest.fn().mockImplementation((args) => args),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const service = new CategoriesService(prisma as never);
  return { service, prisma };
}

describe('CategoriesService.reorderCategories', () => {
  it('writes sortOrder = index for sibling ids', async () => {
    const { service, prisma } = makeCatService([
      { id: 'a', parentCategoryId: 'p' },
      { id: 'b', parentCategoryId: 'p' },
      { id: 'c', parentCategoryId: 'p' },
    ]);
    await service.reorderCategories(['c', 'a', 'b']);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(3);
    expect(prisma.category.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'c' },
      data: { sortOrder: 0 },
    });
  });

  it('rejects nodes that span more than one parent', async () => {
    const { service, prisma } = makeCatService([
      { id: 'a', parentCategoryId: 'p1' },
      { id: 'b', parentCategoryId: 'p2' },
    ]);
    await expect(
      service.reorderCategories(['a', 'b']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects when an id is missing/foreign', async () => {
    const { service, prisma } = makeCatService([
      { id: 'a', parentCategoryId: 'p' },
    ]);
    await expect(
      service.reorderCategories(['a', 'b']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

function makeAttrCreateService(opts: {
  categoryExists: boolean;
  childCount: number;
}) {
  const create = jest.fn().mockImplementation((args) => ({ id: 'new', ...args.data }));
  const prisma = {
    category: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.categoryExists ? { id: 'cat' } : null),
      count: jest.fn().mockResolvedValue(opts.childCount),
    },
    productAttribute: { create },
  };
  const service = new CategoriesService(prisma as never);
  return { service, create };
}

describe('CategoriesService.createAttribute — leaf-only guard', () => {
  const dto = { name: 'Résolution', type: 'SELECT', options: ['HD', '4K'] } as never;

  it('rejects adding an attribute to a NON-leaf category (has children)', async () => {
    const { service, create } = makeAttrCreateService({
      categoryExists: true,
      childCount: 3,
    });
    await expect(service.createAttribute('parent', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('allows adding an attribute to a leaf product type (no children)', async () => {
    const { service, create } = makeAttrCreateService({
      categoryExists: true,
      childCount: 0,
    });
    await service.createAttribute('leaf', dto);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.categoryId).toBe('leaf');
  });
});
