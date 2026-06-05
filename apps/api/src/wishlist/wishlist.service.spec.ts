import { NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { WishlistService } from './wishlist.service';
import { WishlistQueryDto } from './dto/wishlist-query.dto';

function makePrismaStub() {
  return {
    product: { findUnique: jest.fn() },
    wishlist: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  } as any;
}

const USER = 'user-1';
const OTHER_USER = 'user-2';
const PRODUCT = '31000000-0000-0000-0000-000000000058';

describe('WishlistService', () => {
  let prisma: any;
  let svc: WishlistService;

  beforeEach(() => {
    prisma = makePrismaStub();
    svc = new WishlistService(prisma);
  });

  describe('addToWishlist', () => {
    it('rejects a non-existent product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(svc.addToWishlist(USER, PRODUCT)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.wishlist.upsert).not.toHaveBeenCalled();
    });

    it('rejects a soft-deleted product', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: PRODUCT,
        status: ProductStatus.ACTIVE,
        deletedAt: new Date(),
      });
      await expect(svc.addToWishlist(USER, PRODUCT)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.wishlist.upsert).not.toHaveBeenCalled();
    });

    it('rejects a non-ACTIVE product (DRAFT / PENDING_REVIEW / REJECTED)', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: PRODUCT,
        status: ProductStatus.DRAFT,
        deletedAt: null,
      });
      await expect(svc.addToWishlist(USER, PRODUCT)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.wishlist.upsert).not.toHaveBeenCalled();
    });

    it('upserts (idempotent) for an ACTIVE product, scoped to the user', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: PRODUCT,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      });
      prisma.wishlist.upsert.mockResolvedValue({ id: 'w1', product: {} });

      await svc.addToWishlist(USER, PRODUCT);

      expect(prisma.wishlist.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_productId: { userId: USER, productId: PRODUCT } },
          create: { userId: USER, productId: PRODUCT },
          update: {},
        }),
      );
    });
  });

  describe('removeFromWishlist', () => {
    it('deletes the entry when present', async () => {
      prisma.wishlist.findUnique.mockResolvedValue({ id: 'w1' });
      prisma.wishlist.delete.mockResolvedValue({});
      const res = await svc.removeFromWishlist(USER, PRODUCT);
      expect(prisma.wishlist.delete).toHaveBeenCalledWith({
        where: { id: 'w1' },
      });
      expect(res).toEqual({ removed: true });
    });

    it('is a no-op when the entry is absent (idempotent)', async () => {
      prisma.wishlist.findUnique.mockResolvedValue(null);
      const res = await svc.removeFromWishlist(USER, PRODUCT);
      expect(prisma.wishlist.delete).not.toHaveBeenCalled();
      expect(res).toEqual({ removed: true });
    });

    it('looks up the entry scoped to the requesting user (no IDOR)', async () => {
      prisma.wishlist.findUnique.mockResolvedValue(null);
      await svc.removeFromWishlist(OTHER_USER, PRODUCT);
      expect(prisma.wishlist.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_productId: { userId: OTHER_USER, productId: PRODUCT },
          },
        }),
      );
    });
  });

  describe('getWishlistCount', () => {
    it('counts only active, non-deleted products for the user', async () => {
      prisma.wishlist.count.mockResolvedValue(3);
      const res = await svc.getWishlistCount(USER);
      expect(prisma.wishlist.count).toHaveBeenCalledWith({
        where: {
          userId: USER,
          product: { deletedAt: null, status: ProductStatus.ACTIVE },
        },
      });
      expect(res).toEqual({ count: 3 });
    });
  });

  describe('getWishlist', () => {
    it('filters to the user + active, non-deleted products', async () => {
      prisma.wishlist.findMany.mockResolvedValue([]);
      prisma.wishlist.count.mockResolvedValue(0);
      await svc.getWishlist(USER, { page: 1, limit: 20 } as WishlistQueryDto);
      expect(prisma.wishlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: USER,
            product: { deletedAt: null, status: ProductStatus.ACTIVE },
          },
        }),
      );
    });
  });

  describe('getWishlistProductIds', () => {
    it('returns the wishlisted ids, scoped to the user', async () => {
      prisma.wishlist.findMany.mockResolvedValue([
        { productId: 'a' },
        { productId: 'b' },
      ]);
      const ids = await svc.getWishlistProductIds(USER, ['a', 'b', 'c']);
      expect(prisma.wishlist.findMany).toHaveBeenCalledWith({
        where: { userId: USER, productId: { in: ['a', 'b', 'c'] } },
        select: { productId: true },
      });
      expect(ids).toEqual(['a', 'b']);
    });
  });

  describe('isInWishlist', () => {
    it('returns true / false based on the user-scoped lookup', async () => {
      prisma.wishlist.findUnique.mockResolvedValueOnce({ id: 'w1' });
      expect(await svc.isInWishlist(USER, PRODUCT)).toEqual({
        isInWishlist: true,
      });
      prisma.wishlist.findUnique.mockResolvedValueOnce(null);
      expect(await svc.isInWishlist(USER, PRODUCT)).toEqual({
        isInWishlist: false,
      });
    });
  });
});
