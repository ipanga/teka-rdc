import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { createTestApp, mockPrismaService } from './test-utils';

/**
 * Buyer address — the Ville ↔ Commune pair is validated server-side through
 * the same CitiesService resolver sellers use. These tests go through the
 * real HTTP stack (guards, pipes, exception filter) with a signed buyer token
 * and an in-memory commune table, so they pin the wire contract: status
 * codes, the French non-sensitive messages, and the persisted pair.
 */
const BUYER = '10000000-0000-0000-0000-0000000000b1';
const LUB = '01000000-0000-0000-0000-000000000001';
const KOL = '01000000-0000-0000-0000-000000000002';
const KAMPEMBA = '02000000-0000-0000-0000-000000000002';
const DILALA = '02000000-0000-0000-0000-000000000010';
const RETIRED = '02000000-0000-0000-0000-000000000099';
const UNKNOWN = '02000000-0000-0000-0000-00000000dead';
const COMMUNES: Record<string, { id: string; name: string; cityId: string; isActive: boolean }> = {
  [KAMPEMBA]: { id: KAMPEMBA, name: 'Kampemba', cityId: LUB, isActive: true },
  [DILALA]: { id: DILALA, name: 'Dilala', cityId: KOL, isActive: true },
  [RETIRED]: { id: RETIRED, name: 'Ancienne commune', cityId: LUB, isActive: false },
};
const body = {
  province: 'Haut-Katanga',
  town: 'Lubumbashi',
  neighborhood: 'Kampemba',
  avenue: 'Av. Lumumba 24',
  recipientPhone: '+243999000100',
};

describe('Addresses (e2e) — Ville ↔ Commune validation', () => {
  let app: INestApplication;
  let token: string;
  const stored: { row: Record<string, unknown> | null } = { row: null };

  beforeAll(async () => {
    app = await createTestApp();
    token = app.get(JwtService, { strict: false }).sign({ sub: BUYER, role: 'BUYER', phone: '+243999000100', jti: 'e2e' });
  });
  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    stored.row = null;
    const m = mockPrismaService as unknown as Record<string, any>;
    m.address.updateMany ??= jest.fn();
    m.user.findUnique.mockImplementation(({ select }: { select?: { role?: boolean } }) =>
      Promise.resolve(select?.role ? { role: 'BUYER' } : { id: BUYER, role: 'BUYER', status: 'ACTIVE', phone: '+243999000100', deletedAt: null }),
    );
    m.$transaction = jest.fn((cb: (tx: unknown) => unknown) => (typeof cb === 'function' ? cb(mockPrismaService) : Promise.all(cb)));
    m.$queryRaw = jest.fn().mockResolvedValue([{ id: BUYER }]);
    m.commune.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      const c = COMMUNES[where.id];
      return Promise.resolve(c ? { ...c, city: { isActive: true } } : null);
    });
    m.city.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve([LUB, KOL].includes(where.id) ? { id: where.id } : null),
    );
    m.address.findFirst.mockImplementation(() => Promise.resolve(stored.row));
    m.address.findUnique.mockImplementation(() => Promise.resolve(stored.row));
    m.address.findMany.mockImplementation(() => Promise.resolve(stored.row ? [stored.row] : []));
    m.address.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      stored.row = { id: 'addr-1', ...data, deletedAt: null };
      return Promise.resolve(stored.row);
    });
    m.address.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      stored.row = { ...(stored.row ?? { id: 'addr-1', userId: BUYER }), ...data };
      return Promise.resolve(stored.row);
    });
    m.address.updateMany.mockResolvedValue({ count: 0 });
  });

  const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Teka-Surface': 'buyer' });

  it('401 without a token', () =>
    request(app.getHttpServer()).post('/api/v1/addresses').send({ ...body, cityId: LUB, communeId: KAMPEMBA }).expect(401));

  it('valid city + commune → 201 with the pair persisted', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/addresses').set(auth()).send({ ...body, cityId: LUB, communeId: KAMPEMBA }).expect(201);
    expect(res.body.data).toMatchObject({ cityId: LUB, communeId: KAMPEMBA, isDefault: true });
  });

  it('commune of another city → 400 with the French message only', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/addresses').set(auth()).send({ ...body, cityId: LUB, communeId: DILALA }).expect(400);
    expect(res.body).toEqual({ success: false, error: expect.objectContaining({ status: 400, message: 'La commune ne correspond pas à la ville sélectionnée' }) });
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|stack|cityId|Kolwezi/i);
    expect(mockPrismaService.address.create).not.toHaveBeenCalled();
  });

  it('inactive commune → 400 « Commune inactive »; unknown commune → 400 « Commune invalide »', async () => {
    const inactive = await request(app.getHttpServer()).post('/api/v1/addresses').set(auth()).send({ ...body, cityId: LUB, communeId: RETIRED }).expect(400);
    expect(inactive.body.error.message).toBe('Commune inactive');
    const unknown = await request(app.getHttpServer()).post('/api/v1/addresses').set(auth()).send({ ...body, cityId: LUB, communeId: UNKNOWN }).expect(400);
    expect(unknown.body.error.message).toBe('Commune invalide');
    expect(mockPrismaService.address.create).not.toHaveBeenCalled();
  });

  it('PATCH changing the city while retaining the previous commune drops the commune; an explicit mismatch is refused', async () => {
    stored.row = { id: 'addr-1', userId: BUYER, ...body, cityId: LUB, communeId: KAMPEMBA, deletedAt: null };
    const moved = await request(app.getHttpServer()).patch('/api/v1/addresses/addr-1'.replace('addr-1', '10000000-0000-0000-0000-0000000000a1')).set(auth()).send({ cityId: KOL, town: 'Kolwezi' }).expect(200);
    expect(moved.body.data).toMatchObject({ cityId: KOL, communeId: null });
    const res = await request(app.getHttpServer()).patch('/api/v1/addresses/10000000-0000-0000-0000-0000000000a1').set(auth()).send({ cityId: LUB, communeId: DILALA }).expect(400);
    expect(res.body.error.message).toBe('La commune ne correspond pas à la ville sélectionnée');
  });

  it('an existing address whose commune was retired later is still returned and can be edited without re-selecting it', async () => {
    stored.row = { id: 'addr-1', userId: BUYER, ...body, cityId: LUB, communeId: RETIRED, deletedAt: null };
    const list = await request(app.getHttpServer()).get('/api/v1/addresses').set(auth()).expect(200);
    expect(list.body.data[0]).toMatchObject({ communeId: RETIRED });
    const edit = await request(app.getHttpServer()).patch('/api/v1/addresses/10000000-0000-0000-0000-0000000000a1').set(auth()).send({ label: 'Maison' }).expect(200);
    expect(edit.body.data).toMatchObject({ label: 'Maison', communeId: RETIRED });
    await request(app.getHttpServer()).patch('/api/v1/addresses/10000000-0000-0000-0000-0000000000a1').set(auth()).send({ communeId: RETIRED }).expect(400);
  });

  // ─── Recipient phone: one canonical value (PR D2, 2026-09-07) ───────────
  it.each([
    ['0990000001'],
    ['+243 99 000 00 01'],
    ['00243990000001'],
    ['099-000-00-01'],
  ])('recipientPhone %s is persisted as +243990000001', async (phone) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/addresses').set(auth())
      .send({ ...body, cityId: LUB, communeId: KAMPEMBA, recipientPhone: phone })
      .expect(201);
    expect(res.body.data.recipientPhone).toBe('+243990000001');
    expect(stored.row?.recipientPhone).toBe('+243990000001');
  });

  it('an unreadable recipientPhone → 400 with the French message only', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/addresses').set(auth())
      .send({ ...body, cityId: LUB, communeId: KAMPEMBA, recipientPhone: '12 34' })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('Numéro de téléphone invalide');
    expect(JSON.stringify(res.body)).not.toMatch(/matches|regular expression/i);
    expect(stored.row).toBeNull();
  });

  // ─── Historical order snapshot survives a later address edit ──────────
  it('editing the address afterwards does not rewrite the delivery address of an existing order', async () => {
    const m = mockPrismaService as unknown as Record<string, any>;
    // The address as it was when the order was placed (snapshot columns) …
    const snapshot = {
      deliveryLabel: null, deliveryProvince: 'Haut-Katanga', deliveryTown: 'Lubumbashi',
      deliveryNeighborhood: 'Kampemba', deliveryAvenue: 'Av. Lumumba 12', deliveryReference: null,
      deliveryRecipientName: 'Aline K.', deliveryRecipientPhone: '+243990000001',
    };
    // … and the SAME row after the buyer moved (relation now points at B).
    const ORDER = '55555555-5555-4555-8555-555555555555';
    m.order.findUnique.mockResolvedValue({
      id: ORDER, buyerId: BUYER, status: 'DELIVERED', deletedAt: null, deliveryAddressId: 'addr-1',
      ...snapshot,
      deliveryAddress: {
        id: 'addr-1', label: null, province: 'Lualaba', town: 'Kolwezi', neighborhood: 'Dilala',
        avenue: 'Av. Mobutu 3', reference: null, recipientName: 'Aline Kabila', recipientPhone: '+243810000001',
      },
      items: [], statusLogs: [],
    });
    const res = await request(app.getHttpServer()).get(`/api/v1/orders/${ORDER}`).set(auth()).expect(200);
    expect(res.body.data.deliveryAddress).toMatchObject({
      town: 'Lubumbashi', neighborhood: 'Kampemba', avenue: 'Av. Lumumba 12',
      recipientName: 'Aline K.', recipientPhone: '+243990000001',
    });
    for (const key of Object.keys(snapshot)) expect(res.body.data).not.toHaveProperty(key);
  });

  it('GET /locations/neighborhoods lists active communes only', async () => {
    const m = mockPrismaService as unknown as Record<string, any>;
    m.city.findFirst.mockResolvedValue({ id: LUB }); // looked up by name here
    m.commune.findMany.mockResolvedValue([{ name: 'Kampemba' }]);
    const res = await request(app.getHttpServer()).get('/api/v1/addresses/locations/neighborhoods?town=Lubumbashi').expect(200);
    expect(res.body.data).toEqual(['Kampemba']);
    expect((mockPrismaService as unknown as Record<string, any>).commune.findMany.mock.calls[0][0].where).toEqual({ cityId: LUB, isActive: true });
  });
});
