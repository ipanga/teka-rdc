import { ReportsService } from './reports.service';

// Unit coverage for the payouts reconciliation report (Payouts
// Operationalization Phase D / D2). Hand-rolled Prisma mock, mirroring the
// project's other *.service.spec.ts files.
function makeService(payouts: Record<string, unknown>[]) {
  const prisma = {
    payout: { findMany: jest.fn().mockResolvedValue(payouts) },
  };
  return { service: new ReportsService(prisma as never), prisma };
}

describe('ReportsService.getPayoutsReport (D2)', () => {
  it('maps payout rows to the reconciliation report shape', async () => {
    const { service } = makeService([
      {
        createdAt: new Date('2026-06-08T10:00:00Z'),
        amountCDF: BigInt(630000),
        payoutMethod: 'M_PESA',
        payoutPhone: '+243970000001',
        status: 'COMPLETED',
        externalReference: 'MPESA-1',
        processedAt: new Date('2026-06-09T08:00:00Z'),
        rejectionReason: null,
        sellerProfile: {
          businessName: 'Boutique Marie',
          user: { firstName: 'Marie', lastName: 'K' },
        },
      },
    ]);

    const rows = await service.getPayoutsReport({});
    expect(rows[0]).toMatchObject({
      date: '2026-06-08',
      sellerName: 'Marie K',
      businessName: 'Boutique Marie',
      amountCDF: '630000',
      method: 'M_PESA',
      phone: '+243970000001',
      status: 'COMPLETED',
      reference: 'MPESA-1',
      processedAt: '2026-06-09',
      rejectionReason: '',
    });
  });

  it('filters by sellerId via the sellerProfile relation', async () => {
    const { service, prisma } = makeService([]);
    await service.getPayoutsReport({
      sellerId: '10000000-0000-0000-0000-000000000002',
    });
    const arg = prisma.payout.findMany.mock.calls[0][0];
    expect(arg.where.sellerProfile).toEqual({
      userId: '10000000-0000-0000-0000-000000000002',
    });
  });
});
