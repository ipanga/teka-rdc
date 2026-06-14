import { CatalogResetService } from './catalog-reset.service';

function makeService(over: Record<string, unknown> = {}) {
  const prisma = {
    orderItem: {
      findMany: jest.fn().mockResolvedValue([]), // no order history by default
    },
    product: {
      count: jest.fn().mockResolvedValue(3),
      findMany: jest.fn().mockResolvedValue([
        { id: 'p1', images: [{ cloudinaryId: 'c1' }, { cloudinaryId: 'c2' }] },
        { id: 'p2', images: [{ cloudinaryId: 'c3' }] },
        { id: 'p3', images: [] },
      ]),
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    productImage: { count: jest.fn().mockResolvedValue(3) },
    productSpecification: { count: jest.fn().mockResolvedValue(5) },
    review: { count: jest.fn().mockResolvedValue(2) },
    wishlist: { count: jest.fn().mockResolvedValue(1) },
    cartItem: { count: jest.fn().mockResolvedValue(4) },
    promotion: { count: jest.fn().mockResolvedValue(1) },
    ...over,
  };
  const cloudinary = { deleteImages: jest.fn().mockResolvedValue(undefined) };
  const service = new CatalogResetService(prisma as never, cloudinary as never);
  return { service, prisma, cloudinary };
}

describe('CatalogResetService.resetCatalog', () => {
  it('dry run reports counts without deleting anything', async () => {
    const { service, prisma, cloudinary } = makeService();

    const report = await service.resetCatalog({ dryRun: true });

    expect(prisma.product.deleteMany).not.toHaveBeenCalled();
    expect(cloudinary.deleteImages).not.toHaveBeenCalled();
    expect(report.dryRun).toBe(true);
    expect(report.productsTotal).toBe(3);
    expect(report.productsDeletable).toBe(3);
    expect(report.productsDeleted).toBe(0);
    expect(report.productsSkippedWithOrders).toBe(0);
    expect(report.cloudinaryAssetsPurged).toBe(0);
    expect(report.cascade).toEqual({
      images: 3,
      specifications: 5,
      reviews: 2,
      wishlistEntries: 1,
      cartItems: 4,
    });
    expect(report.promotionsDetached).toBe(1);
  });

  it('real run deletes deletable products and purges their Cloudinary assets', async () => {
    const { service, prisma, cloudinary } = makeService();

    const report = await service.resetCatalog({ dryRun: false });

    expect(prisma.product.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2', 'p3'] } },
    });
    expect(cloudinary.deleteImages).toHaveBeenCalledWith(['c1', 'c2', 'c3']);
    expect(report.productsDeleted).toBe(3);
    expect(report.cloudinaryAssetsPurged).toBe(3);
  });

  it('defaults to a dry run when no options are passed', async () => {
    const { service, prisma } = makeService();

    const report = await service.resetCatalog();

    expect(prisma.product.deleteMany).not.toHaveBeenCalled();
    expect(report.dryRun).toBe(true);
  });

  it('skips products referenced by order history (RESTRICT) and excludes them from the query', async () => {
    const { service, prisma } = makeService({
      orderItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { productId: 'ordered1' },
            { productId: 'ordered2' },
          ]),
      },
      product: {
        count: jest.fn().mockResolvedValue(5),
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', images: [] },
          { id: 'p2', images: [] },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    });

    const report = await service.resetCatalog({ dryRun: false });

    // The candidate query must exclude the order-referenced products.
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { id: { notIn: ['ordered1', 'ordered2'] } },
      select: { id: true, images: { select: { cloudinaryId: true } } },
    });
    expect(report.productsSkippedWithOrders).toBe(2);
    expect(report.productsDeleted).toBe(2);
  });

  it('is a no-op when there are no deletable products', async () => {
    const { service, prisma, cloudinary } = makeService({
      product: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
    });

    const report = await service.resetCatalog({ dryRun: false });

    expect(prisma.product.deleteMany).not.toHaveBeenCalled();
    expect(cloudinary.deleteImages).not.toHaveBeenCalled();
    expect(report.productsDeletable).toBe(0);
    expect(report.productsDeleted).toBe(0);
  });
});
