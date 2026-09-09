import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { createTestApp, mockPrismaService, resetMocks } from './test-utils';

/**
 * S14 (2026-09-09) — request bounds, through the real ValidationPipe.
 *
 * Two shapes were wrong. Pagination was `@Type(() => Number)` only, so a
 * seller could ask for `limit=1000000` and pull their whole catalogue with
 * images in one query. And enum filters (`status`, `role`) were free strings
 * cast straight into Prisma enum filters, which answers a 500 — a client
 * error surfacing as a server error, and noise in Sentry.
 *
 * Each case asserts the boundary is accepted, one over is refused, a
 * malformed value is refused, and the French error body leaks nothing.
 */
const SELLER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BUYER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const USERS: Record<string, Record<string, unknown>> = {
  [SELLER]: { id: SELLER, role: 'SELLER', status: 'ACTIVE', phone: null, email: 'marie@example.cd', deletedAt: null },
  [ADMIN]: { id: ADMIN, role: 'ADMIN', status: 'ACTIVE', phone: null, email: 'admin@example.cd', deletedAt: null },
  [BUYER]: { id: BUYER, role: 'BUYER', status: 'ACTIVE', phone: '+243999000101', email: null, deletedAt: null },
};

describe('DTO bounds (e2e) — S14', () => {
  let app: INestApplication;
  let sellerToken: string;
  let adminToken: string;
  let buyerToken: string;
  const m = mockPrismaService as Record<string, any>;
  const asSeller = () => ({ Authorization: `Bearer ${sellerToken}`, 'X-Teka-Surface': 'seller' });
  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}`, 'X-Teka-Surface': 'admin' });
  const asBuyer = () => ({ Authorization: `Bearer ${buyerToken}`, 'X-Teka-Surface': 'buyer' });

  const expect400 = (res: request.Response) => {
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: { status: 400 } });
    // A validation refusal never leaks a stack, a query or a Prisma detail.
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js:\d+|node_modules|prisma|PrismaClient/i);
  };

  beforeAll(async () => {
    app = await createTestApp();
    const jwt = app.get(JwtService, { strict: false });
    sellerToken = jwt.sign({ sub: SELLER, role: 'SELLER', phone: null, jti: 'e2e-s14-seller' });
    adminToken = jwt.sign({ sub: ADMIN, role: 'ADMIN', phone: null, jti: 'e2e-s14-admin' });
    buyerToken = jwt.sign({ sub: BUYER, role: 'BUYER', phone: '+243999000101', jti: 'e2e-s14-buyer' });
  });
  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    resetMocks();
    m.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(USERS[where.id] ?? null),
    );
    // Enough for the happy paths to reach a 200 rather than an unrelated error.
    m.sellerProfile.findUnique.mockResolvedValue({ id: 'sp1', userId: SELLER, applicationStatus: 'APPROVED' });
    m.sellerProfile.findFirst.mockResolvedValue({ id: 'sp1', userId: SELLER, applicationStatus: 'APPROVED' });
    m.product.findMany.mockResolvedValue([]);
    m.product.count.mockResolvedValue(0);
    m.user.findMany.mockResolvedValue([]);
    m.user.count.mockResolvedValue(0);
  });

  describe('seller product list — pagination and status', () => {
    const url = '/api/v1/sellers/products';

    it('accepts the boundary (limit=100, page=1) and refuses one over', async () => {
      const ok = await request(app.getHttpServer()).get(`${url}?limit=100&page=1`).set(asSeller());
      expect(ok.status).toBe(200);

      expect400(await request(app.getHttpServer()).get(`${url}?limit=101`).set(asSeller()));
      expect400(await request(app.getHttpServer()).get(`${url}?limit=1000000`).set(asSeller()));
      expect400(await request(app.getHttpServer()).get(`${url}?page=0`).set(asSeller()));
    });

    it('refuses malformed pagination instead of coercing it', async () => {
      expect400(await request(app.getHttpServer()).get(`${url}?limit=abc`).set(asSeller()));
      expect400(await request(app.getHttpServer()).get(`${url}?limit=1.5`).set(asSeller()));
      expect400(await request(app.getHttpServer()).get(`${url}?page=-5`).set(asSeller()));
    });

    it('an unknown status is a French 400, not the 500 a raw enum cast produced', async () => {
      const res = await request(app.getHttpServer()).get(`${url}?status=NOPE`).set(asSeller());
      expect400(res);
      expect(res.body.error.message).toBeDefined();
      const ok = await request(app.getHttpServer()).get(`${url}?status=ACTIVE`).set(asSeller());
      expect(ok.status).toBe(200);
    });

    it('a 200-character search is accepted, 201 is refused', async () => {
      const ok = await request(app.getHttpServer()).get(`${url}?search=${'a'.repeat(200)}`).set(asSeller());
      expect(ok.status).toBe(200);
      expect400(await request(app.getHttpServer()).get(`${url}?search=${'a'.repeat(201)}`).set(asSeller()));
    });
  });

  describe('admin user search — enums and pagination', () => {
    const url = '/api/v1/admin/users';

    it('refuses an unknown role or status with a 400 rather than a 500', async () => {
      expect400(await request(app.getHttpServer()).get(`${url}?role=SUPERUSER`).set(asAdmin()));
      expect400(await request(app.getHttpServer()).get(`${url}?status=DELETED`).set(asAdmin()));
    });

    it('accepts real enum values and the pagination boundary', async () => {
      for (const q of ['role=SELLER', 'status=ACTIVE', 'limit=100', 'page=1']) {
        const res = await request(app.getHttpServer()).get(`${url}?${q}`).set(asAdmin());
        expect(res.status).toBe(200);
      }
      expect400(await request(app.getHttpServer()).get(`${url}?limit=101`).set(asAdmin()));
    });
  });

  describe('buyer address free text', () => {
    const url = '/api/v1/addresses';
    const base = {
      province: 'Haut-Katanga',
      town: 'Lubumbashi',
      neighborhood: 'Kampemba',
      recipientPhone: '+243999000101',
    };

    it('refuses an over-long province, town, neighbourhood or label', async () => {
      for (const field of ['province', 'town', 'neighborhood'] as const) {
        const res = await request(app.getHttpServer())
          .post(url)
          .set(asBuyer())
          .send({ ...base, [field]: 'a'.repeat(81) });
        expect400(res);
      }
      expect400(
        await request(app.getHttpServer())
          .post(url)
          .set(asBuyer())
          .send({ ...base, label: 'a'.repeat(61) }),
      );
    });

    it('accepts values exactly at the boundary', async () => {
      // The write itself is mocked away; reaching past validation is the point.
      const res = await request(app.getHttpServer())
        .post(url)
        .set(asBuyer())
        .send({ ...base, province: 'a'.repeat(80), label: 'a'.repeat(60) });
      expect(res.status).not.toBe(400);
    });
  });
});
