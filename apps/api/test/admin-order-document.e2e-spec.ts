import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { createTestApp, mockPrismaService, resetMocks } from './test-utils';

/**
 * P1 — the printable « Bon de livraison » (admin-web) reads ONLY
 * GET /v1/admin/orders/:id. Pin what the document relies on: ADMIN-only,
 * never cached, snapshot address, exact money as strings, list-price snapshot.
 */
describe('GET /v1/admin/orders/:id — source of the printable delivery document (e2e)', () => {
  let app: INestApplication;
  const m = mockPrismaService as Record<string, any>;
  const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
  const SELLER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
  const BUYER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003';
  const ORDER = '70000000-0000-4000-8000-000000000042';
  let tokens: Record<'admin' | 'seller' | 'buyer', string>;

  const as = (role: 'admin' | 'seller' | 'buyer') => ({
    Authorization: `Bearer ${tokens[role]}`,
    'X-Teka-Surface': role,
  });

  beforeAll(async () => {
    app = await createTestApp();
    const jwt = app.get(JwtService, { strict: false });
    tokens = {
      admin: jwt.sign({ sub: ADMIN, role: 'ADMIN', phone: null, jti: 'p1-admin' }),
      seller: jwt.sign({ sub: SELLER, role: 'SELLER', phone: null, jti: 'p1-seller' }),
      buyer: jwt.sign({ sub: BUYER, role: 'BUYER', phone: '+243999000131', jti: 'p1-buyer' }),
    };
  });
  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMocks();
    const users: Record<string, { role: string }> = { [ADMIN]: { role: 'ADMIN' }, [SELLER]: { role: 'SELLER' }, [BUYER]: { role: 'BUYER' } };
    m.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(users[where.id] ? { id: where.id, ...users[where.id], status: 'ACTIVE', deletedAt: null } : null),
    );
    m.sellerProfile.findUnique.mockResolvedValue(null); // no earning yet → zero-commission projection
    m.order.findUnique.mockResolvedValue({
      id: ORDER,
      orderNumber: 'TK-20261017-7Q4P',
      status: 'OUT_FOR_DELIVERY',
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      buyerId: BUYER,
      sellerId: SELLER,
      subtotalCDF: BigInt('987654321098765'),
      deliveryFeeCDF: BigInt(0),
      totalCDF: BigInt('987654321098765'),
      buyerNote: 'Appeler avant <b>17h</b>',
      deliveryAddressId: 'addr-live',
      // Snapshot columns taken at checkout…
      deliveryLabel: 'Maison',
      deliveryProvince: 'Haut-Katanga',
      deliveryTown: 'Lubumbashi',
      deliveryNeighborhood: 'Kampemba',
      deliveryAvenue: 'Avenue Kasavubu 12',
      deliveryReference: 'Derrière la paroisse',
      deliveryRecipientName: 'Ilunga Mwamba',
      deliveryRecipientPhone: '+243999000131',
      // …and the buyer's LIVE address, edited since: must not be served.
      deliveryAddress: { id: 'addr-live', town: 'Kolwezi', neighborhood: 'Dilala' },
      earning: null,
      items: [
        { id: 'i1', productId: 'p1', productTitle: 'Pagne wax', quantity: 3, unitPriceCDF: BigInt(2250000), listUnitPriceCDF: BigInt(2500000), totalCDF: BigInt(6750000), product: { categoryId: null } },
      ],
      statusLogs: [],
      createdAt: new Date('2026-10-17T08:00:00Z'),
      deletedAt: null,
    });
  });

  it('401 without a session', async () => {
    await request(app.getHttpServer()).get(`/api/v1/admin/orders/${ORDER}`).expect(401);
    expect(m.order.findUnique).not.toHaveBeenCalled();
  });

  it.each(['seller', 'buyer'] as const)('403 for a %s — the document data is ADMIN-only', async (role) => {
    await request(app.getHttpServer()).get(`/api/v1/admin/orders/${ORDER}`).set(as(role)).expect(403);
    expect(m.order.findUnique).not.toHaveBeenCalled();
  });

  it('admin: private no-store, snapshot address, exact money strings, list-price snapshot selected', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/admin/orders/${ORDER}`).set(as('admin')).expect(200);

    expect(res.headers['cache-control']).toBe('no-store');
    const d = res.body.data;
    expect(d.deliveryAddress).toMatchObject({
      town: 'Lubumbashi', neighborhood: 'Kampemba', avenue: 'Avenue Kasavubu 12',
      reference: 'Derrière la paroisse', recipientName: 'Ilunga Mwamba', recipientPhone: '+243999000131',
    });
    expect(d.deliveryTown).toBeUndefined(); // flat snapshot columns stay internal
    expect(d.totalCDF).toBe('987654321098765'); // beyond 2^53, exact
    expect(d.items[0]).toMatchObject({ unitPriceCDF: '2250000', listUnitPriceCDF: '2500000', totalCDF: '6750000' });
    expect(d.buyerNote).toBe('Appeler avant <b>17h</b>'); // raw text; the document escapes on render

    const select = m.order.findUnique.mock.calls[0][0].include.items.select;
    expect(select).toMatchObject({ productTitle: true, unitPriceCDF: true, listUnitPriceCDF: true, totalCDF: true });
  });

  it('reading the document never writes', async () => {
    await request(app.getHttpServer()).get(`/api/v1/admin/orders/${ORDER}`).set(as('admin')).expect(200);
    expect(m.order.update).not.toHaveBeenCalled();
    expect(m.order.create).not.toHaveBeenCalled();
  });
});
