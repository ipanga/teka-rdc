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
  // GET /api/v1/browse/products/:id
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/browse/products/:id', () => {
    it('should return 404 for non-existent product', async () => {
      const id = '30000000-0000-0000-0000-000000000999';
      mockPrismaService.product.findUnique.mockResolvedValue(null);

      return request(app.getHttpServer())
        .get(`/api/v1/browse/products/${id}`)
        .expect(404);
    });

    it('should reject an invalid UUID', () => {
      return request(app.getHttpServer())
        .get('/api/v1/browse/products/not-a-uuid')
        .expect(400);
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
