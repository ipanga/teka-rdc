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
