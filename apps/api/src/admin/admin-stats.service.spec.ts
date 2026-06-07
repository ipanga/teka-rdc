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
