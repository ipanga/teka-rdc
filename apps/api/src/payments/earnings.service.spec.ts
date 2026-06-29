import { Decimal } from '@prisma/client/runtime/library';
import { EarningsService } from './earnings.service';

// EarningsService only depends on PrismaService → mock it directly.
function makeService(overrides?: {
  existingEarning?: unknown;
  order?: unknown;
  categorySetting?: unknown;
  globalSetting?: unknown;
}) {
  const tx = {
    sellerEarning: { create: jest.fn().mockResolvedValue({}) },
    sellerProfile: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    sellerEarning: {
      findUnique: jest.fn().mockResolvedValue(overrides?.existingEarning ?? null),
    },
    order: {
      findUnique: jest.fn().mockResolvedValue(overrides?.order ?? null),
    },
    commissionSetting: {
      findUnique: jest.fn().mockResolvedValue(overrides?.categorySetting ?? null),
      findFirst: jest.fn().mockResolvedValue(overrides?.globalSetting ?? null),
    },
    sellerProfile: { update: jest.fn() },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const service = new EarningsService(prisma as never);
  return { service, prisma, tx };
}

const orderFor = (subtotalCDF: bigint, categoryId: string | null = null) => ({
  id: 'o1',
  sellerId: 's1',
  subtotalCDF,
  items: [{ product: { categoryId } }],
  seller: { sellerProfile: { id: 'sp1' } },
});

describe('EarningsService.createEarning', () => {
  it('computes commission on the subtotal (excl. delivery) at the 10% default and credits net to the wallet', async () => {
    // 1.000.000 centimes subtotal, no category → default 10%.
    const { service, tx } = makeService({ order: orderFor(1000000n) });
    await service.createEarning('o1');

    expect(tx.sellerEarning.create).toHaveBeenCalledTimes(1);
    const data = (tx.sellerEarning.create as jest.Mock).mock.calls[0][0].data;
    expect(data.grossAmountCDF).toBe(1000000n);
    expect(data.commissionCDF).toBe(100000n); // round(1.000.000 * 0.10)
    expect(data.netAmountCDF).toBe(900000n);
    expect((data.commissionRate as Decimal).toString()).toBe('0.1');

    // Wallet credited by the NET amount.
    expect(tx.sellerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sp1' },
        data: { walletBalanceCDF: { increment: 900000n } },
      }),
    );
  });

  it('rounds the commission (banker-free Math.round)', async () => {
    // 333.333 centimes * 0.10 = 33333.3 → round → 33333.
    const { service, tx } = makeService({ order: orderFor(333333n) });
    await service.createEarning('o1');
    const data = (tx.sellerEarning.create as jest.Mock).mock.calls[0][0].data;
    expect(data.commissionCDF).toBe(33333n);
    expect(data.netAmountCDF).toBe(300000n);
  });

  it('uses a category-specific commission rate when configured', async () => {
    const { service, tx } = makeService({
      order: orderFor(1000000n, 'cat-1'),
      categorySetting: { rate: new Decimal('0.1500') }, // 15%
    });
    await service.createEarning('o1');
    const data = (tx.sellerEarning.create as jest.Mock).mock.calls[0][0].data;
    expect(data.commissionCDF).toBe(150000n);
    expect(data.netAmountCDF).toBe(850000n);
  });

  it('is idempotent — skips when an earning already exists for the order', async () => {
    const { service, tx } = makeService({
      existingEarning: { id: 'e1' },
      order: orderFor(1000000n),
    });
    await service.createEarning('o1');
    expect(tx.sellerEarning.create).not.toHaveBeenCalled();
    expect(tx.sellerProfile.update).not.toHaveBeenCalled();
  });
});
