import { BrowseService } from './browse.service';

// Minimal Prisma mock — browseProducts builds a where + orderBy then calls
// product.findMany. We assert the ordering, not the data.
function makeService() {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const prisma = { product: { findMany, count } };
  const service = new BrowseService(prisma as never);
  return { service, findMany };
}

interface FindManyArg {
  orderBy: Array<Record<string, string>>;
}

describe('BrowseService.browseProducts — real-above-demo ranking (P3a)', () => {
  it('orders by isDemo asc first (real merchant products before demo)', async () => {
    const { service, findMany } = makeService();
    await service.browseProducts({} as never);
    const calls = findMany.mock.calls as unknown as FindManyArg[][];
    const { orderBy } = calls[0][0];
    expect(Array.isArray(orderBy)).toBe(true);
    expect(orderBy[0]).toEqual({ isDemo: 'asc' });
  });

  it('keeps the buyer’s chosen sort as the secondary key', async () => {
    const { service, findMany } = makeService();
    await service.browseProducts({ sortBy: 'price_low' } as never);
    const calls = findMany.mock.calls as unknown as FindManyArg[][];
    const { orderBy } = calls[0][0];
    expect(orderBy[0]).toEqual({ isDemo: 'asc' });
    expect(orderBy[1]).toEqual({ priceCDF: 'asc' });
  });

  it('popularity ranks by unitsSold (best-seller) with recency as tiebreaker', async () => {
    const { service, findMany } = makeService();
    await service.browseProducts({ sortBy: 'popularity' } as never);
    const calls = findMany.mock.calls as unknown as FindManyArg[][];
    const { orderBy } = calls[0][0];
    expect(orderBy).toEqual([
      { isDemo: 'asc' },
      { unitsSold: 'desc' },
      { createdAt: 'desc' },
    ]);
  });
});
