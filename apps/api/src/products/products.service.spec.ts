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
