import { NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { CommissionService } from './commission.service';

function makeService(opts: { existing?: unknown; category?: unknown } = {}) {
  const prisma = {
    commissionSetting: {
      findFirst: jest.fn().mockResolvedValue(opts.existing ?? null),
      findUnique: jest.fn().mockResolvedValue(opts.existing ?? null),
      update: jest
        .fn()
        .mockImplementation(
          (a: { data: { rate: Decimal; isActive: boolean } }) =>
            Promise.resolve({ id: 'g1', categoryId: null, ...a.data }),
        ),
      create: jest
        .fn()
        .mockImplementation(
          (a: {
            data: {
              rate: Decimal;
              isActive: boolean;
              categoryId: string | null;
            };
          }) => Promise.resolve({ id: 'new', ...a.data }),
        ),
      delete: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    category: {
      findUnique: jest.fn().mockResolvedValue(opts.category ?? null),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new CommissionService(prisma as never, audit as never);
  return { service, prisma, audit };
}

describe('CommissionService', () => {
  it('updates the single existing global row instead of creating a second one, and audits before/after', async () => {
    const { service, prisma, audit } = makeService({
      existing: {
        id: 'g1',
        categoryId: null,
        rate: new Decimal('0.1000'),
        isActive: true,
      },
    });
    const saved = await service.upsertSetting({ rate: 0.12 }, 'admin1');
    expect(prisma.commissionSetting.create).not.toHaveBeenCalled();
    expect(prisma.commissionSetting.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'g1' } }),
    );
    expect(saved.rate.toFixed(4)).toBe('0.1200');
    expect(audit.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: 'COMMISSION_SETTING_UPSERTED',
        actorId: 'admin1',
        before: { rate: '0.1', isActive: true },
        after: expect.objectContaining({ rate: '0.12' }),
      }),
    );
  });

  it('creates a category override for an existing category', async () => {
    const { service, prisma } = makeService({ category: { id: 'cat-1' } });
    const saved = await service.upsertSetting(
      { categoryId: 'cat-1', rate: 0.08 },
      'admin1',
    );
    expect(prisma.commissionSetting.create).toHaveBeenCalled();
    expect(saved.categoryId).toBe('cat-1');
  });

  it('rejects an unknown category', async () => {
    const { service } = makeService();
    await expect(
      service.upsertSetting({ categoryId: 'cat-x', rate: 0.08 }, 'admin1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('removeOverride deletes and audits the previous state', async () => {
    const { service, prisma, audit } = makeService({
      existing: {
        id: 'c1',
        categoryId: 'cat-1',
        rate: new Decimal('0.0800'),
        isActive: true,
      },
    });
    await service.removeOverride('cat-1', 'admin1');
    expect(prisma.commissionSetting.delete).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: 'COMMISSION_SETTING_REMOVED',
        before: expect.objectContaining({ rate: '0.08' }),
      }),
    );
  });
});
