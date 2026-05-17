import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetMocks, mockPrismaService } from './test-utils';

describe('Browse (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMocks();
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/browse/categories
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/browse/categories', () => {
    it('should return a category tree', async () => {
      const mockCategories = [
        {
          id: '20000000-0000-0000-0000-000000000001',
          name: { fr: 'Electronique', en: 'Electronics' },
          slug: 'electronique',
          parentCategoryId: null,
          isActive: true,
          sortOrder: 0,
          _count: { products: 5 },
        },
      ];
      mockPrismaService.category.findMany.mockResolvedValue(mockCategories);

      const res = await request(app.getHttpServer())
        .get('/api/v1/browse/categories')
        .expect(200);

      // ResponseInterceptor wraps: { success: true, data: [...] }
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should be accessible without authentication (public)', () => {
      mockPrismaService.category.findMany.mockResolvedValue([]);

      return request(app.getHttpServer())
        .get('/api/v1/browse/categories')
        .expect(200);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/browse/products
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/browse/products', () => {
    it('should return an empty product listing', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      const res = await request(app.getHttpServer())
        .get('/api/v1/browse/products')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toEqual([]);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.total).toBe(0);
      expect(res.body.data.pagination.hasMore).toBe(false);
    });

    it('should accept search query parameter', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      const res = await request(app.getHttpServer())
        .get('/api/v1/browse/products?search=t%C3%A9l%C3%A9phone')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('builds a plain-string OR filter for search (regression — JSONB path errored 500 against String columns)', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/api/v1/browse/products?search=xbox')
        .expect(200);

      const findManyArgs = mockPrismaService.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where.OR).toEqual([
        { title: { contains: 'xbox', mode: 'insensitive' } },
        { description: { contains: 'xbox', mode: 'insensitive' } },
      ]);
    });

    it('should accept condition filter', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      const res = await request(app.getHttpServer())
        .get('/api/v1/browse/products?condition=NEW')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should accept sortBy=price_low', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      return request(app.getHttpServer())
        .get('/api/v1/browse/products?sortBy=price_low')
        .expect(200);
    });

    it('should accept sortBy=price_high', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      return request(app.getHttpServer())
        .get('/api/v1/browse/products?sortBy=price_high')
        .expect(200);
    });

    it('should accept sortBy=newest', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      return request(app.getHttpServer())
        .get('/api/v1/browse/products?sortBy=newest')
        .expect(200);
    });

    it('should accept sortBy=rating', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      return request(app.getHttpServer())
        .get('/api/v1/browse/products?sortBy=rating')
        .expect(200);
    });

    it('should reject an invalid sortBy value', () => {
      return request(app.getHttpServer())
        .get('/api/v1/browse/products?sortBy=invalid')
        .expect(400);
    });

    it('should reject an invalid condition value', () => {
      return request(app.getHttpServer())
        .get('/api/v1/browse/products?condition=BROKEN')
        .expect(400);
    });

    it('should accept price range filters', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      return request(app.getHttpServer())
        .get('/api/v1/browse/products?minPrice=1000&maxPrice=50000')
        .expect(200);
    });

    it('should accept limit parameter', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      return request(app.getHttpServer())
        .get('/api/v1/browse/products?limit=10')
        .expect(200);
    });

    it('should reject limit > 100', () => {
      return request(app.getHttpServer())
        .get('/api/v1/browse/products?limit=200')
        .expect(400);
    });

    it('should reject limit < 1', () => {
      return request(app.getHttpServer())
        .get('/api/v1/browse/products?limit=0')
        .expect(400);
    });

    it('should be accessible without authentication (public)', () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      return request(app.getHttpServer())
        .get('/api/v1/browse/products')
        .expect(200);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/browse/products/:identifier
  // Route accepts either a UUID or a slug. Non-existent lookups return 404
  // regardless of format — there's no longer a "reject non-UUID with 400"
  // code path (that behavior was removed when slug-based product URLs shipped
  // as part of the city-marketplace upgrade).
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/browse/products/:identifier', () => {
    it('should return 404 for a non-existent UUID', async () => {
      const id = '30000000-0000-0000-0000-000000000999';
      mockPrismaService.product.findUnique.mockResolvedValue(null);

      return request(app.getHttpServer())
        .get(`/api/v1/browse/products/${id}`)
        .expect(404);
    });

    it('should return 404 for an unknown slug', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(null);

      return request(app.getHttpServer())
        .get('/api/v1/browse/products/not-a-real-slug')
        .expect(404);
    });

    it('flattens the seller shape to { id, businessName } matching BrowseSeller', async () => {
      // Regression — the detail endpoint previously returned the raw Prisma
      // include `{ id, firstName, lastName, sellerProfile: { businessName } }`,
      // while the list endpoint returned the flat `{ id, businessName }`. The
      // buyer-web cart hydration assumed list-shape; reading
      // `seller.businessName` was undefined → cart page crashed with
      // `Cannot read properties of undefined (reading 'trim')`.
      mockPrismaService.product.findFirst.mockResolvedValue({
        id: '30000000-0000-0000-0000-000000000001',
        slug: 'sample-product',
        title: 'Sample Product',
        description: 'desc',
        priceCDF: '100000',
        priceUSD: null,
        quantity: 5,
        condition: 'NEW',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        category: null,
        images: [],
        specifications: [],
        seller: {
          id: 'seller-1',
          firstName: 'John',
          lastName: 'Doe',
          sellerProfile: { businessName: 'Acme Shop' },
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/browse/products/sample-product')
        .expect(200);

      expect(res.body.data.seller).toEqual({
        id: 'seller-1',
        businessName: 'Acme Shop',
      });
      expect(res.body.data.seller.firstName).toBeUndefined();
      expect(res.body.data.seller.sellerProfile).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/browse/banners (via BannersPublicController)
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/browse/banners', () => {
    it('should return active banners', async () => {
      // refreshActiveBanners calls updateMany
      mockPrismaService.banner.updateMany.mockResolvedValue({ count: 0 });
      // getActiveBanners: DB query
      mockPrismaService.banner.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/browse/banners')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should be accessible without authentication (public)', async () => {
      mockPrismaService.banner.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.banner.findMany.mockResolvedValue([]);

      return request(app.getHttpServer())
        .get('/api/v1/browse/banners')
        .expect(200);
    });
  });
});
