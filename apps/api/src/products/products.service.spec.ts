import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';

const APPROVED_SELLER = { userId: 'seller1', applicationStatus: 'APPROVED', cityId: null };

function makeService(over: Record<string, any> = {}) {
  const prisma = {
    category: { findUnique: jest.fn().mockResolvedValue({ id: 'cat1', isActive: true, deletedAt: null }) },
    sellerProfile: { findUnique: jest.fn().mockResolvedValue(APPROVED_SELLER) },
    brand: { findFirst: jest.fn().mockResolvedValue({ id: 'brand1' }) },
    product: {
      findUnique: jest.fn().mockResolvedValue(null), // shortCode clash check → free
      create: jest.fn().mockResolvedValue({ id: 'p1', categoryId: 'cat1', status: 'DRAFT' }),
    },
    ...over,
  };
  const analytics = { capture: jest.fn() };
  const adminNotifications = { create: jest.fn().mockResolvedValue(undefined) };
  const service = new ProductsService(
    prisma as never,
    {} as never,
    analytics as never,
    adminNotifications as never,
  );
  return { service, prisma, adminNotifications };
}

const baseDto = {
  title: 'Tecno Spark',
  description: 'Smartphone',
  categoryId: '13000000-0000-0000-0000-000000000201',
  priceCDF: '38000000',
  quantity: 5,
  condition: 'NEW',
};

describe('ProductsService.create — brand handling', () => {
  it('passes brandId through to product.create when the brand exists', async () => {
    const { service, prisma } = makeService();
    await service.create('seller1', { ...baseDto, brandId: '15000000-0000-0000-0000-000000000003' } as never);
    expect(prisma.brand.findFirst).toHaveBeenCalled();
    const createArg = prisma.product.create.mock.calls[0][0];
    expect(createArg.data.brandId).toBe('15000000-0000-0000-0000-000000000003');
  });

  it('rejects an unknown brandId with 400 before creating', async () => {
    const { service, prisma } = makeService({
      brand: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.create('seller1', { ...baseDto, brandId: '15000000-0000-0000-0000-0000000000ff' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('creates without a brand (brandId undefined) when none is given', async () => {
    const { service, prisma } = makeService();
    await service.create('seller1', baseDto as never);
    expect(prisma.brand.findFirst).not.toHaveBeenCalled();
    expect(prisma.product.create.mock.calls[0][0].data.brandId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Discount price (per-product seller-set promo)
// ---------------------------------------------------------------------------
describe('ProductsService.create — discount price', () => {
  it('persists a valid discount (< price)', async () => {
    const { service, prisma } = makeService();
    await service.create('seller1', {
      ...baseDto,
      discountPriceCDF: '30000000',
    } as never);
    const data = prisma.product.create.mock.calls[0][0].data;
    expect(data.discountPriceCDF).toBe(30000000n);
    expect(data.discountPriceUSD).toBeNull();
  });

  it('stores null (no promo) when discount is omitted', async () => {
    const { service, prisma } = makeService();
    await service.create('seller1', baseDto as never);
    expect(prisma.product.create.mock.calls[0][0].data.discountPriceCDF).toBeNull();
  });

  it.each([
    ['equal to price', '38000000'],
    ['greater than price', '40000000'],
    ['zero', '0'],
  ])('rejects a discount %s (400)', async (_label, discountPriceCDF) => {
    const { service, prisma } = makeService();
    await expect(
      service.create('seller1', { ...baseDto, discountPriceCDF } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('rejects a USD discount with no USD price (400)', async () => {
    const { service } = makeService();
    await expect(
      service.create('seller1', {
        ...baseDto,
        discountPriceUSD: '1000',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ProductsService.update — edit-after-publish + discount', () => {
  const ACTIVE = {
    id: 'p1',
    sellerId: 'seller1',
    status: 'ACTIVE',
    priceCDF: 38000000n,
    priceUSD: null,
    discountPriceCDF: null,
    discountPriceUSD: null,
    categoryId: 'cat1',
  };

  function makeUpdateService(product: Record<string, unknown>) {
    const updateMock = jest
      .fn()
      .mockResolvedValue({ id: 'p1', status: product.status });
    const prisma = {
      category: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'cat1', isActive: true, deletedAt: null }),
      },
      brand: { findFirst: jest.fn().mockResolvedValue({ id: 'brand1' }) },
      product: {
        findUnique: jest.fn().mockResolvedValue(product),
        update: updateMock,
      },
      productSpecification: { deleteMany: jest.fn() },
      productStatusLog: { create: jest.fn() },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          product: { update: updateMock },
          productSpecification: { deleteMany: jest.fn() },
        }),
      ),
    };
    const service = new ProductsService(
      prisma as never,
      {} as never,
      { capture: jest.fn() } as never,
      { create: jest.fn() } as never,
    );
    return { service, updateMock };
  }

  it('allows price/discount/stock edits on a published (ACTIVE) product', async () => {
    const { service, updateMock } = makeUpdateService(ACTIVE);
    await service.update('seller1', 'p1', {
      priceCDF: '40000000',
      discountPriceCDF: '30000000',
      quantity: 10,
    } as never);
    const data = updateMock.mock.calls[0][0].data;
    expect(data.priceCDF).toBe(40000000n);
    expect(data.discountPriceCDF).toBe(30000000n);
    expect(data.quantity).toBe(10);
  });

  it('re-reviews (ACTIVE → PENDING_REVIEW) when a content field is edited on a published product', async () => {
    // D2: a content edit to a live product is allowed but re-enters moderation.
    const { service, updateMock } = makeUpdateService(ACTIVE);
    await service.update('seller1', 'p1', { title: 'Nouveau titre' } as never);
    const data = updateMock.mock.calls[0][0].data;
    expect(data.title).toBe('Nouveau titre');
    expect(data.status).toBe('PENDING_REVIEW');
  });

  it('keeps ACTIVE (no re-review) when only price/stock are edited', async () => {
    const { service, updateMock } = makeUpdateService(ACTIVE);
    await service.update('seller1', 'p1', { priceCDF: '40000000' } as never);
    const data = updateMock.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
  });

  it('rejects editing a SUSPENDED product (400)', async () => {
    const { service, updateMock } = makeUpdateService({
      id: 'p1',
      status: 'SUSPENDED',
    });
    await expect(
      service.update('seller1', 'p1', { title: 'x' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects a price drop to at/below an existing discount (400)', async () => {
    const { service } = makeUpdateService({
      ...ACTIVE,
      discountPriceCDF: 30000000n,
    });
    await expect(
      service.update('seller1', 'p1', { priceCDF: '25000000' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clears the discount when null is sent', async () => {
    const { service, updateMock } = makeUpdateService({
      ...ACTIVE,
      discountPriceCDF: 30000000n,
    });
    await service.update('seller1', 'p1', {
      discountPriceCDF: null,
    } as never);
    expect(updateMock.mock.calls[0][0].data.discountPriceCDF).toBeNull();
  });
});
