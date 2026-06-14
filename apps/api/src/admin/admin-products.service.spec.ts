import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminProductsService } from './admin-products.service';

function makeService(productRow: unknown) {
  const prisma = {
    product: {
      findUnique: jest.fn().mockResolvedValue(productRow),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const cloudinary = { deleteImages: jest.fn().mockResolvedValue(undefined) };
  const sellerNotifications = {};
  const analytics = { capture: jest.fn() };
  const service = new AdminProductsService(
    prisma as never,
    cloudinary as never,
    sellerNotifications as never,
    analytics as never,
  );
  return { service, prisma, cloudinary };
}

describe('AdminProductsService.hardDeleteProduct', () => {
  it('deletes the product and purges its Cloudinary assets', async () => {
    const { service, prisma, cloudinary } = makeService({
      id: 'p1',
      images: [{ cloudinaryId: 'c1' }, { cloudinaryId: 'c2' }],
      _count: { orderItems: 0 },
    });

    const res = await service.hardDeleteProduct('p1');

    expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(cloudinary.deleteImages).toHaveBeenCalledWith(['c1', 'c2']);
    expect(res).toEqual({ deleted: true, purgedAssets: 2 });
  });

  it('refuses to delete a product with order history (preserve records)', async () => {
    const { service, prisma, cloudinary } = makeService({
      id: 'p1',
      images: [{ cloudinaryId: 'c1' }],
      _count: { orderItems: 3 },
    });

    await expect(service.hardDeleteProduct('p1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.product.delete).not.toHaveBeenCalled();
    expect(cloudinary.deleteImages).not.toHaveBeenCalled();
  });

  it('throws NotFound when the product does not exist', async () => {
    const { service, prisma } = makeService(null);

    await expect(service.hardDeleteProduct('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.product.delete).not.toHaveBeenCalled();
  });

  it('skips the Cloudinary call when the product has no images', async () => {
    const { service, cloudinary } = makeService({
      id: 'p1',
      images: [],
      _count: { orderItems: 0 },
    });

    const res = await service.hardDeleteProduct('p1');

    expect(cloudinary.deleteImages).not.toHaveBeenCalled();
    expect(res).toEqual({ deleted: true, purgedAssets: 0 });
  });
});
