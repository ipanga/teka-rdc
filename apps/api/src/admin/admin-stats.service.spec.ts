import { AdminStatsService } from './admin-stats.service';

// getDashboardStats fans out many prisma calls via Promise.all. This mock
// returns benign zero-ish values for all of them and distinguishes the two
// sellerProfile.count calls by their where.applicationStatus.
function makeService() {
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(0) },
    order: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalCDF: null } }),
    },
    sellerEarning: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { commissionCDF: null } }),
    },
    payout: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _count: 0, _sum: { amountCDF: null } }),
    },
    sellerProfile: {
      count: jest
        .fn()
        .mockImplementation(
          (args: { where?: { applicationStatus?: string } }) =>
            Promise.resolve(
              args?.where?.applicationStatus === 'PENDING' ? 7 : 2,
            ),
        ),
    },
  };
  const service = new AdminStatsService(prisma as never);
  return { service };
}

describe('AdminStatsService.getDashboardStats — pending seller applications (QA-3)', () => {
  it('returns the count of PENDING applications, distinct from approved sellers', async () => {
    const { service } = makeService();
    const res = await service.getDashboardStats();
    expect(res.data.pendingSellerApplicationsCount).toBe(7);
    expect(res.data.totalSellers).toBe(2); // APPROVED only
  });
});

describe('AdminStatsService.getCatalogCoverage (P3b)', () => {
  it('rolls subcategory product counts up to the root, split by real vs demo', async () => {
    // Tree: Électronique(root) → Téléphones(sub). Products live on the sub.
    const prisma = {
      product: {
        groupBy: jest.fn().mockResolvedValue([
          { categoryId: 'sub-phones', isDemo: true, _count: { _all: 4 } },
          { categoryId: 'sub-phones', isDemo: false, _count: { _all: 3 } },
        ]),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'root-elec', name: 'Électronique', parentCategoryId: null },
          {
            id: 'sub-phones',
            name: 'Téléphones',
            parentCategoryId: 'root-elec',
          },
          { id: 'root-mode', name: 'Mode', parentCategoryId: null },
        ]),
      },
    };
    const service = new AdminStatsService(prisma as never);

    const res = await service.getCatalogCoverage();
    const elec = res.data.find((c) => c.categoryId === 'root-elec');
    const mode = res.data.find((c) => c.categoryId === 'root-mode');

    expect(elec).toMatchObject({ realCount: 3, demoCount: 4 });
    // Empty root categories still surface at zero.
    expect(mode).toMatchObject({ realCount: 0, demoCount: 0 });
    // Subcategories are not returned as their own rows.
    expect(res.data.some((c) => c.categoryId === 'sub-phones')).toBe(false);
  });
});
