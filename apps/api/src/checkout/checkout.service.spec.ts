import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

// Minimal mocks — quote() touches cartService.getCartSummary,
// prisma.address.findFirst, prisma.sellerProfile.findFirst, and
// deliveryZonesService.estimateFee. The other deps are unused by quote().
function makeService(overrides?: {
  cartSummary?: unknown;
  address?: unknown;
  sellerCityByUser?: Record<string, string>;
  estimate?: (
    from: string,
    to: string,
  ) => { feeCDF: string; feeUSD: string | null };
}) {
  const sellerCityByUser = overrides?.sellerCityByUser ?? {};
  const cartService = {
    getCartSummary: jest.fn().mockResolvedValue(overrides?.cartSummary),
  };
  const prisma = {
    address: { findFirst: jest.fn().mockResolvedValue(overrides?.address) },
    sellerProfile: {
      findFirst: jest.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          sellerCityByUser[where.userId]
            ? { location: null, city: { name: sellerCityByUser[where.userId] } }
            : null,
        ),
      ),
    },
  };
  // Default zone table: intra-city 3,000 CDF, Kolwezi→Lubumbashi 15,000 CDF,
  // everything else the 5,000 default — mirrors the seed's intent.
  const estimate =
    overrides?.estimate ??
    ((from: string, to: string) => {
      if (from === to) return { feeCDF: '300000', feeUSD: '120' };
      if (from === 'Kolwezi' && to === 'Lubumbashi')
        return { feeCDF: '1500000', feeUSD: '600' };
      return { feeCDF: '500000', feeUSD: '200' };
    });
  const deliveryZones = {
    estimateFee: jest.fn((from: string, to: string) =>
      Promise.resolve({ data: { ...estimate(from, to), isDefault: false } }),
    ),
  };
  const service = new CheckoutService(
    prisma as never,
    cartService as never,
    deliveryZones as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, cartService, prisma, deliveryZones };
}

describe('CheckoutService.quote', () => {
  it('throws on an empty cart', async () => {
    const { service } = makeService({
      cartSummary: { items: [], sellerGroups: [] },
    });
    await expect(service.quote('u1', 'addr1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it("throws when the address isn't the buyer's", async () => {
    const { service } = makeService({
      cartSummary: { items: [{}], sellerGroups: [] },
      address: null,
    });
    await expect(service.quote('u1', 'addr1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns per-seller subtotal + delivery fee + total, summed correctly', async () => {
    const { service, deliveryZones } = makeService({
      address: { town: 'Lubumbashi' },
      sellerCityByUser: { sellerA: 'Lubumbashi', sellerB: 'Kolwezi' },
      cartSummary: {
        items: [{}, {}],
        sellerGroups: [
          {
            sellerId: 'sellerA',
            sellerName: 'Boutique A',
            items: [{ quantity: 2 }],
            subtotalCDF: 1000000n,
          },
          {
            sellerId: 'sellerB',
            sellerName: 'Boutique B',
            items: [{ quantity: 1 }],
            subtotalCDF: 2000000n,
          },
        ],
      },
    });

    const { data } = await service.quote('u1', 'addr1');

    // sellerA: Lubumbashi→Lubumbashi = intra-city 3,000 CDF (300000 centimes)
    // sellerB: Kolwezi→Lubumbashi   = inter-city 15,000 CDF (1500000)
    expect(data.sellerQuotes).toEqual([
      expect.objectContaining({
        sellerId: 'sellerA',
        sellerName: 'Boutique A',
        itemCount: 2,
        subtotalCDF: '1000000',
        deliveryFeeCDF: '300000',
        totalCDF: '1300000',
      }),
      expect.objectContaining({
        sellerId: 'sellerB',
        itemCount: 1,
        subtotalCDF: '2000000',
        deliveryFeeCDF: '1500000',
        totalCDF: '3500000',
      }),
    ]);
    expect(data.subtotalCDF).toBe('3000000'); // 1.0M + 2.0M
    expect(data.deliveryFeeCDF).toBe('1800000'); // 300k + 1.5M
    expect(data.totalCDF).toBe('4800000'); // subtotal + delivery

    // Parity: quote resolved each seller's fee via estimateFee with the SAME
    // (fromTown, toTown) checkout() uses (seller city → buyer address town).
    expect(deliveryZones.estimateFee).toHaveBeenCalledWith(
      'Lubumbashi',
      'Lubumbashi',
    );
    expect(deliveryZones.estimateFee).toHaveBeenCalledWith(
      'Kolwezi',
      'Lubumbashi',
    );
  });

  it("falls back to 'Lubumbashi' as fromTown when the seller has no city/location", async () => {
    const { service, deliveryZones } = makeService({
      address: { town: 'Kolwezi' },
      sellerCityByUser: {}, // no profile → null → fallback
      cartSummary: {
        items: [{}],
        sellerGroups: [
          {
            sellerId: 'sX',
            sellerName: 'X',
            items: [{ quantity: 1 }],
            subtotalCDF: 500000n,
          },
        ],
      },
    });
    const { data } = await service.quote('u1', 'addr1');
    expect(deliveryZones.estimateFee).toHaveBeenCalledWith(
      'Lubumbashi',
      'Kolwezi',
    );
    expect(data.deliveryFeeCDF).toBe('500000'); // default route
  });
});
