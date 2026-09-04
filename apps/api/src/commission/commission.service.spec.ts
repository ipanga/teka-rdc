import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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

// ---------------------------------------------------------------------------
// PR 5 — per-seller override (SellerProfile.commissionRate)
// ---------------------------------------------------------------------------

function makeSellerService(opts: {
  profile?: { id: string; businessName?: string; commissionRate: Decimal | null } | null;
  global?: { id: string; rate: Decimal; updatedAt?: Date } | null;
  categoryCount?: number;
  updateCount?: number;
  lastChange?: unknown;
} = {}) {
  const profile =
    opts.profile === undefined
      ? { id: 'sp1', businessName: 'Boutique Marie', commissionRate: null }
      : opts.profile;
  const prisma = {
    sellerProfile: {
      findUnique: jest.fn().mockResolvedValue(profile),
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateCount ?? 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    commissionSetting: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.global === undefined
            ? { id: 'g1', rate: new Decimal('0.1'), updatedAt: new Date() }
            : opts.global,
        ),
      count: jest.fn().mockResolvedValue(opts.categoryCount ?? 0),
    },
    adminAuditLog: {
      findFirst: jest.fn().mockResolvedValue(opts.lastChange ?? null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'admin1', firstName: 'Aline', lastName: 'K.' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new CommissionService(prisma as never, audit as never);
  return { service, prisma, audit };
}

describe('CommissionService — seller commission context (read)', () => {
  it('no override → the platform default applies (GLOBAL)', async () => {
    const { service } = makeSellerService();
    const res = await service.getSellerCommission('sp1');
    expect(res.overrideRate).toBeNull();
    expect(res.platformDefaultRate).toBe('0.1');
    expect(res.effectiveRate).toBe('0.1');
    expect(res.effectiveSource).toBe('GLOBAL');
    expect(res.lastChange).toBeNull();
  });

  it('override wins over the platform default (SELLER), and 0 % is a real override', async () => {
    const a = makeSellerService({
      profile: { id: 'sp1', commissionRate: new Decimal('0.0825') },
    });
    const ra = await a.service.getSellerCommission('sp1');
    expect(ra.overrideRate).toBe('0.0825');
    expect(ra.effectiveRate).toBe('0.0825');
    expect(ra.effectiveSource).toBe('SELLER');

    const b = makeSellerService({
      profile: { id: 'sp1', commissionRate: new Decimal(0) },
    });
    const rb = await b.service.getSellerCommission('sp1');
    expect(rb.overrideRate).toBe('0');
    expect(rb.effectiveRate).toBe('0');
    expect(rb.effectiveSource).toBe('SELLER');
  });

  it('no global setting and no override → nothing applies (null, never a fabricated 10 %)', async () => {
    const { service } = makeSellerService({ global: null });
    const res = await service.getSellerCommission('sp1');
    expect(res.platformDefaultRate).toBeNull();
    expect(res.effectiveRate).toBeNull();
    expect(res.effectiveSource).toBeNull();
  });

  it('reports how many active category rates can still precede the default, and the last change with its actor', async () => {
    const { service } = makeSellerService({
      categoryCount: 2,
      lastChange: {
        action: 'SELLER_COMMISSION_OVERRIDE_SET',
        actorId: 'admin1',
        before: { commissionRate: null },
        after: { commissionRate: '0.05' },
        createdAt: new Date('2026-09-04T10:00:00Z'),
      },
    });
    const res = await service.getSellerCommission('sp1');
    expect(res.activeCategoryOverrides).toBe(2);
    expect(res.lastChange?.actor?.firstName).toBe('Aline');
    expect(res.lastChange?.after).toEqual({ commissionRate: '0.05' });
  });

  it('unknown seller → 404', async () => {
    const { service } = makeSellerService({ profile: null });
    await expect(service.getSellerCommission('nope')).rejects.toThrow(NotFoundException);
  });
});

describe('CommissionService.setSellerOverride', () => {
  it('sets the override conditionally on the previous value and audits before/after', async () => {
    const { service, prisma, audit } = makeSellerService();
    const res = await service.setSellerOverride('sp1', 0.0825, 'admin1');
    expect(res.changed).toBe(true);
    const call = prisma.sellerProfile.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'sp1', commissionRate: null });
    expect(call.data.commissionRate.toString()).toBe('0.0825');
    expect(audit.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        actorId: 'admin1',
        action: 'SELLER_COMMISSION_OVERRIDE_SET',
        entityType: 'seller_profile',
        entityId: 'sp1',
        before: { commissionRate: null },
        after: { commissionRate: '0.0825' },
      }),
    );
  });

  it('normalises through the integer representation (0.1 and 0.1000 are one rate) and treats an unchanged value as a no-op without an audit row', async () => {
    const { service, prisma, audit } = makeSellerService({
      profile: { id: 'sp1', commissionRate: new Decimal('0.1000') },
    });
    const res = await service.setSellerOverride('sp1', 0.1, 'admin1');
    expect(res.changed).toBe(false);
    expect(prisma.sellerProfile.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('a 0 % override is stored as 0, not treated as "no override"', async () => {
    const { service, prisma, audit } = makeSellerService();
    const res = await service.setSellerOverride('sp1', 0, 'admin1');
    expect(res.changed).toBe(true);
    expect(prisma.sellerProfile.updateMany.mock.calls[0][0].data.commissionRate.toString()).toBe('0');
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('rejects negative, > 100 % and > 4-decimal rates with 400 before touching the DB', async () => {
    for (const bad of [-0.01, 1.0001, 0.12345, Number.NaN]) {
      const { service, prisma } = makeSellerService();
      await expect(service.setSellerOverride('sp1', bad, 'admin1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.sellerProfile.updateMany).not.toHaveBeenCalled();
    }
  });

  it('accepts the boundaries 0 and 1 (100 %)', async () => {
    const hi = makeSellerService();
    await expect(hi.service.setSellerOverride('sp1', 1, 'admin1')).resolves.toMatchObject({ changed: true });
  });

  it('loses a concurrent edit → 409, no audit row', async () => {
    const { service, audit } = makeSellerService({ updateCount: 0 });
    await expect(service.setSellerOverride('sp1', 0.05, 'admin1')).rejects.toThrow(
      ConflictException,
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('unknown seller → 404, nothing written', async () => {
    const { service, prisma } = makeSellerService({ profile: null });
    await expect(service.setSellerOverride('nope', 0.05, 'admin1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.sellerProfile.updateMany).not.toHaveBeenCalled();
  });
});

describe('CommissionService.clearSellerOverride', () => {
  it('clears the override (fallback to category / platform) and audits the previous rate', async () => {
    const { service, prisma, audit } = makeSellerService({
      profile: { id: 'sp1', commissionRate: new Decimal('0.05') },
    });
    // After the write, the re-read reflects the cleared state.
    prisma.sellerProfile.findUnique
      .mockResolvedValueOnce({ id: 'sp1', commissionRate: new Decimal('0.05') })
      .mockResolvedValue({ id: 'sp1', businessName: 'Boutique Marie', commissionRate: null });
    const res = await service.clearSellerOverride('sp1', 'admin1');
    expect(res.changed).toBe(true);
    expect(res.effectiveSource).toBe('GLOBAL');
    expect(res.effectiveRate).toBe('0.1');
    const call = prisma.sellerProfile.updateMany.mock.calls[0][0];
    expect(call.where.commissionRate.toString()).toBe('0.05');
    expect(call.data).toEqual({ commissionRate: null });
    expect(audit.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: 'SELLER_COMMISSION_OVERRIDE_CLEARED',
        before: { commissionRate: '0.05' },
        after: { commissionRate: null },
      }),
    );
  });

  it('is idempotent: nothing to clear → no write, no audit row', async () => {
    const { service, prisma, audit } = makeSellerService();
    const res = await service.clearSellerOverride('sp1', 'admin1');
    expect(res.changed).toBe(false);
    expect(prisma.sellerProfile.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('loses a concurrent edit → 409', async () => {
    const { service } = makeSellerService({
      profile: { id: 'sp1', commissionRate: new Decimal('0.05') },
      updateCount: 0,
    });
    await expect(service.clearSellerOverride('sp1', 'admin1')).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('CommissionService.listHistory', () => {
  it('resolves actors and targets (platform / category / seller) and the before → after rates', async () => {
    const { service, prisma } = makeSellerService();
    prisma.adminAuditLog.findMany.mockResolvedValue([
      {
        id: 'a3', action: 'SELLER_COMMISSION_OVERRIDE_SET', actorId: 'admin1', entityType: 'seller_profile', entityId: 'sp1',
        before: { commissionRate: null }, after: { commissionRate: '0.05' }, createdAt: new Date(),
      },
      {
        id: 'a2', action: 'COMMISSION_SETTING_UPSERTED', actorId: 'admin1', entityType: 'commission_setting', entityId: 'c1',
        before: { rate: '0.1', isActive: true }, after: { categoryId: 'cat1', rate: '0.08', isActive: true }, createdAt: new Date(),
      },
      {
        id: 'a1', action: 'COMMISSION_SETTING_UPSERTED', actorId: 'admin2', entityType: 'commission_setting', entityId: 'g1',
        before: null, after: { categoryId: null, rate: '0.1', isActive: true }, createdAt: new Date(),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 'admin1', firstName: 'Aline', lastName: 'K.' }]);
    prisma.sellerProfile.findMany.mockResolvedValue([{ id: 'sp1', businessName: 'Boutique Marie' }]);
    prisma.category.findMany.mockResolvedValue([{ id: 'cat1', name: 'Électronique' }]);

    const rows = await service.listHistory(10);
    expect(prisma.adminAuditLog.findMany.mock.calls[0][0].take).toBe(10);
    expect(rows.map((r) => r.target)).toEqual([
      { kind: 'SELLER', id: 'sp1', label: 'Boutique Marie' },
      { kind: 'CATEGORY', id: 'cat1', label: 'Électronique' },
      { kind: 'PLATFORM', id: 'g1', label: 'Taux par défaut de la plateforme' },
    ]);
    expect(rows[0].beforeRate).toBeNull();
    expect(rows[0].afterRate).toBe('0.05');
    expect(rows[1].beforeRate).toBe('0.1');
    expect(rows[1].afterRate).toBe('0.08');
    expect(rows[0].actor.firstName).toBe('Aline');
    // Unknown actor still renders (id only), never crashes the list.
    expect(rows[2].actor).toEqual({ id: 'admin2', firstName: null, lastName: null });
  });
});

describe('CommissionService — optimistic concurrency (expectedPreviousRate)', () => {
  it('set: the operator saw "no override" but one exists now → 409, nothing written', async () => {
    const { service, prisma, audit } = makeSellerService({
      profile: { id: 'sp1', commissionRate: new Decimal('0.06') },
    });
    await expect(service.setSellerOverride('sp1', 0.07, 'admin1', null)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.sellerProfile.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('set: the operator saw 8,25 % but it is 6 % now → 409 naming the current value', async () => {
    const { service } = makeSellerService({
      profile: { id: 'sp1', commissionRate: new Decimal('0.06') },
    });
    await expect(service.setSellerOverride('sp1', 0.07, 'admin1', 0.0825)).rejects.toThrow(
      /0\.06/,
    );
  });

  it('set: matching expectation (normalised, 0.1 ≡ 0.1000) proceeds', async () => {
    const { service } = makeSellerService({
      profile: { id: 'sp1', commissionRate: new Decimal('0.1000') },
    });
    await expect(service.setSellerOverride('sp1', 0.07, 'admin1', 0.1)).resolves.toMatchObject({ changed: true });
  });

  it('clear: expectation mismatch → 409; match → cleared', async () => {
    const a = makeSellerService({ profile: { id: 'sp1', commissionRate: new Decimal('0.06') } });
    await expect(a.service.clearSellerOverride('sp1', 'admin1', 0.05)).rejects.toThrow(ConflictException);
    expect(a.prisma.sellerProfile.updateMany).not.toHaveBeenCalled();
    const b = makeSellerService({ profile: { id: 'sp1', commissionRate: new Decimal('0.06') } });
    await expect(b.service.clearSellerOverride('sp1', 'admin1', 0.06)).resolves.toMatchObject({ changed: true });
  });

  it('platform default: expectation mismatch → 409 before any write or audit', async () => {
    const { service, prisma, audit } = makeService({
      existing: { id: 'g1', categoryId: null, rate: new Decimal('0.125'), isActive: true },
    });
    await expect(
      service.upsertSetting({ rate: 0.1, expectedPreviousRate: 0.1 }, 'admin1'),
    ).rejects.toThrow(ConflictException);
    expect(prisma.commissionSetting.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('platform default: no expectation given → unchanged behaviour (older clients)', async () => {
    const { service, prisma } = makeService({
      existing: { id: 'g1', categoryId: null, rate: new Decimal('0.125'), isActive: true },
    });
    await service.upsertSetting({ rate: 0.1 }, 'admin1');
    expect(prisma.commissionSetting.update).toHaveBeenCalledTimes(1);
  });
});

