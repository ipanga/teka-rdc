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

// ─── CSV generation (shared csv.util adoption) ───────────────────────────
//
// These lock in the two things the refactor promised: the emitted columns are
// unchanged, and user-controlled text can no longer smuggle a formula into a
// finance spreadsheet. Before the refactor `escapeCsv` did RFC-4180 quoting
// only, so a seller could name their shop `=cmd|'/c calc'!A1` and have it land
// in the payouts CSV verbatim.

function mockRes() {
  return { setHeader: jest.fn(), write: jest.fn(), end: jest.fn() };
}

/** All CSV body text written by a generator, header row included. */
function writtenCsv(res: { write: jest.Mock }): string {
  return res.write.mock.calls.map((c) => c[0] as string).join('');
}

describe('ReportsService CSV output', () => {
  it('keeps the payouts header row exactly as before the refactor', async () => {
    const { service } = makeService([]);
    const res = mockRes();
    await service.generatePayoutsCsv({}, res as never);
    expect(writtenCsv(res)).toContain(
      'Date,Seller,Business,Amount CDF,Method,Phone,Status,Reference,Processed At,Rejection Reason\n',
    );
  });

  it('writes the UTF-8 BOM so Excel renders French accents', async () => {
    const { service } = makeService([]);
    const res = mockRes();
    await service.generatePayoutsCsv({}, res as never);
    expect(res.write.mock.calls[0][0]).toBe('﻿');
  });

  it('neutralises a formula smuggled through a seller business name', async () => {
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
          businessName: "=cmd|'/c calc'!A1",
          user: { firstName: 'Marie', lastName: 'K' },
        },
      },
    ]);
    const res = mockRes();
    await service.generatePayoutsCsv({}, res as never);

    const csv = writtenCsv(res);
    expect(csv).toContain(`"'=cmd|'/c calc'!A1"`);
    // The raw payload must not survive anywhere as a cell of its own.
    expect(csv).not.toContain(`,=cmd`);
  });

  it('keeps a +243 phone literal instead of letting Excel evaluate it', async () => {
    const { service } = makeService([
      {
        createdAt: new Date('2026-06-08T10:00:00Z'),
        amountCDF: BigInt(630000),
        payoutMethod: 'M_PESA',
        payoutPhone: '+243970000001',
        status: 'COMPLETED',
        externalReference: 'MPESA-1',
        processedAt: null,
        rejectionReason: null,
        sellerProfile: {
          businessName: 'Boutique Marie',
          user: { firstName: 'Marie', lastName: 'K' },
        },
      },
    ]);
    const res = mockRes();
    await service.generatePayoutsCsv({}, res as never);
    expect(writtenCsv(res)).toContain(`"'+243970000001"`);
  });

  it('emits amounts as bare integers, not formula-prefixed text', async () => {
    const { service } = makeService([
      {
        createdAt: new Date('2026-06-08T10:00:00Z'),
        amountCDF: BigInt(630000),
        payoutMethod: 'M_PESA',
        payoutPhone: '+243970000001',
        status: 'COMPLETED',
        externalReference: null,
        processedAt: null,
        rejectionReason: null,
        sellerProfile: {
          businessName: 'Boutique Marie',
          user: { firstName: 'Marie', lastName: 'K' },
        },
      },
    ]);
    const res = mockRes();
    await service.generatePayoutsCsv({}, res as never);
    expect(writtenCsv(res)).toContain(',630000,');
  });

  it('still produces a header-only file when there is nothing to export', async () => {
    const { service } = makeService([]);
    const res = mockRes();
    await service.generatePayoutsCsv({}, res as never);
    expect(res.write).toHaveBeenCalledTimes(2); // BOM + header row
    expect(res.end).toHaveBeenCalledTimes(1);
  });
});
