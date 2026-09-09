import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-utils';

/**
 * Payouts surface (Initiative #3 — Seller Payouts Operationalization).
 *
 * Payouts move real money, so the authz gates are the most important part of
 * the contract: a stranger must not be able to drive a payout's state machine,
 * read/write a seller's payout destination, or pull the finance reconciliation
 * export. Every endpoint inherits the global JwtAuthGuard; without an auth
 * cookie / Bearer, every request must 401. (The state-machine + wallet-integrity
 * behaviour is covered by the unit specs in src/payouts/payouts.service.spec.ts.)
 */
const UUID = '00000000-0000-0000-0000-000000000001';

describe('Payouts (e2e) — auth-protection contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Seller payout detail (notification / deep-link target) ────────────
  it('GET /api/v1/sellers/payouts/:id returns 401 without auth', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/sellers/payouts/${UUID}`)
      .expect(401);
  });

  // ─── Admin lifecycle transitions ───────────────────────────────────────
  it('POST /api/v1/admin/payouts/:id/approve returns 401 without auth', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/payouts/${UUID}/approve`)
      .expect(401);
  });

  it('POST /api/v1/admin/payouts/:id/process returns 401 without auth', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/payouts/${UUID}/process`)
      .expect(401);
  });

  it('POST /api/v1/admin/payouts/:id/complete returns 401 without auth', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/payouts/${UUID}/complete`)
      .send({ externalReference: 'MPESA-1' })
      .expect(401);
  });

  it('POST /api/v1/admin/payouts/:id/reject returns 401 without auth', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/payouts/${UUID}/reject`)
      .send({ reason: 'x' })
      .expect(401);
  });

  // ─── Seller request + destination ──────────────────────────────────────
  it('POST /api/v1/sellers/payouts returns 401 without auth', () => {
    return request(app.getHttpServer())
      .post('/api/v1/sellers/payouts')
      .send({ payoutMethod: 'M_PESA', payoutPhone: '+243970000001' })
      .expect(401);
  });

  it('GET /api/v1/sellers/payout-method returns 401 without auth', () => {
    return request(app.getHttpServer())
      .get('/api/v1/sellers/payout-method')
      .expect(401);
  });

  it('PATCH /api/v1/sellers/payout-method returns 401 without auth', () => {
    return request(app.getHttpServer())
      .patch('/api/v1/sellers/payout-method')
      .send({ payoutMethod: 'M_PESA', payoutPhone: '+243970000001' })
      .expect(401);
  });

  it('GET /api/v1/sellers/wallet returns 401 without auth', () => {
    return request(app.getHttpServer())
      .get('/api/v1/sellers/wallet')
      .expect(401);
  });

  // ─── Admin finance export ──────────────────────────────────────────────
  it('GET /api/v1/admin/reports/payouts/csv returns 401 without auth', () => {
    return request(app.getHttpServer())
      .get('/api/v1/admin/reports/payouts/csv')
      .expect(401);
  });
});

// ---------------------------------------------------------------------------
// S12 — payout destination: re-authentication, cooling-off, authoritative
// routing, audit, throttle (security/payout-destination-reauth, 2026-09-09).
// Runs through the real guards, DTO validation, service and filter with the
// mocked Prisma; the notification fan-out is fire-and-forget and mocked.
// ---------------------------------------------------------------------------
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { mockPrismaService, resetMocks } from './test-utils';

describe('Payouts (e2e) — S12 payout destination is a re-authenticated, cooled-off, server-owned value', () => {
  const SELLER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const BUYER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const PROFILE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const HASH = bcrypt.hashSync('Secret123!', 4);
  const SAVED = { payoutMethod: 'M_PESA', payoutPhone: '+243970000001' };
  const NEW = { payoutMethod: 'AIRTEL_MONEY', payoutPhone: '+243990000002' };

  let app: INestApplication;
  let sellerToken: string;
  let buyerToken: string;
  const m = mockPrismaService as Record<string, any>;
  const asSeller = () => ({ Authorization: `Bearer ${sellerToken}`, 'X-Teka-Surface': 'seller' });
  const asBuyer = () => ({ Authorization: `Bearer ${buyerToken}`, 'X-Teka-Surface': 'buyer' });

  /** Profile state the mocks serve (pre-read AND the FOR UPDATE row). */
  function profile(changedAt: Date | null, dest = SAVED) {
    const row = { id: PROFILE, ...dest, payoutMethodChangedAt: changedAt };
    m.sellerProfile.findUnique.mockResolvedValue(row);
    m.$queryRaw.mockResolvedValue([row]);
    m.sellerProfile.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ payoutMethod: data.payoutMethod, payoutPhone: data.payoutPhone, payoutMethodChangedAt: data.payoutMethodChangedAt }),
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    const jwt = app.get(JwtService, { strict: false });
    sellerToken = jwt.sign({ sub: SELLER, role: 'SELLER', phone: null, jti: 'e2e-s12-seller' });
    buyerToken = jwt.sign({ sub: BUYER, role: 'BUYER', phone: '+243999000101', jti: 'e2e-s12-buyer' });
  });
  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMocks();
    m.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === SELLER
          ? { id: SELLER, role: 'SELLER', status: 'ACTIVE', email: 'marie@example.cd', phone: null, passwordHash: HASH, deletedAt: null }
          : where.id === BUYER
            ? { id: BUYER, role: 'BUYER', status: 'ACTIVE', email: null, phone: '+243999000101', passwordHash: null, deletedAt: null }
            : null,
      ),
    );
    m.adminAuditLog.create.mockResolvedValue({});
    m.payout.findFirst.mockResolvedValue(null);
    m.payout.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'pay-1', status: 'REQUESTED', ...data }));
    m.sellerEarning.findMany.mockResolvedValue([{ id: 'e1', netAmountCDF: BigInt(700000) }]);
    m.sellerEarning.updateMany ??= jest.fn();
    m.sellerEarning.updateMany.mockResolvedValue({ count: 1 });
    m.payout.create ??= jest.fn();
    m.$queryRaw ??= jest.fn();
    m.userNotification ??= {};
    m.userNotification.findFirst ??= jest.fn();
    m.userNotification.create ??= jest.fn();
    m.userNotification.findFirst.mockResolvedValue(null);
    m.userNotification.create.mockResolvedValue({});
    profile(null);
  });

  it('a buyer cannot touch the payout destination (403)', async () => {
    await request(app.getHttpServer()).patch('/api/v1/sellers/payout-method').set(asBuyer()).send({ ...NEW, password: 'x' }).expect(403);
    await request(app.getHttpServer()).get('/api/v1/sellers/payout-method').set(asBuyer()).expect(403);
    expect(m.sellerProfile.update).not.toHaveBeenCalled();
  });

  it('GET exposes the saved destination + cooling-off state only', async () => {
    const changedAt = new Date(Date.now() - 60 * 60 * 1000);
    profile(changedAt);
    const res = await request(app.getHttpServer()).get('/api/v1/sellers/payout-method').set(asSeller()).expect(200);
    expect(Object.keys(res.body.data).sort()).toEqual(['changedAt', 'payoutMethod', 'payoutPhone', 'payoutsAvailableAt']);
    expect(new Date(res.body.data.payoutsAvailableAt).getTime()).toBe(changedAt.getTime() + 24 * 60 * 60 * 1000);
  });

  it('re-saving the UNCHANGED destination needs no password (old clients keep working) and writes nothing', async () => {
    const res = await request(app.getHttpServer()).patch('/api/v1/sellers/payout-method').set(asSeller()).send(SAVED).expect(200);
    expect(res.body.data).toMatchObject({ ...SAVED, payoutsAvailableAt: null });
    expect(m.sellerProfile.update).not.toHaveBeenCalled();
    expect(m.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('changing the destination without a password → French 400, nothing written', async () => {
    const res = await request(app.getHttpServer()).patch('/api/v1/sellers/payout-method').set(asSeller()).send(NEW).expect(400);
    expect(res.body.error.message).toBe('Le mot de passe est requis pour modifier la destination de retrait.');
    expect(m.sellerProfile.update).not.toHaveBeenCalled();
  });

  it('a wrong password → generic French 403 (not a 401, so no client refresh/replay), nothing written, the password is never echoed', async () => {
    const res = await request(app.getHttpServer()).patch('/api/v1/sellers/payout-method').set(asSeller()).send({ ...NEW, password: 'wrong-pass' }).expect(403);
    expect(res.body.error.message).toBe('Mot de passe invalide.');
    expect(JSON.stringify(res.body)).not.toMatch(/wrong-pass|Secret123/);
    expect(m.sellerProfile.update).not.toHaveBeenCalled();
    expect(m.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('the correct password changes the destination: cooling-off stamped, audit row with MASKED phones, no secret anywhere in the response', async () => {
    const before = Date.now();
    const res = await request(app.getHttpServer()).patch('/api/v1/sellers/payout-method').set(asSeller()).send({ ...NEW, password: 'Secret123!' }).expect(200);
    expect(res.body.data).toMatchObject(NEW);
    expect(new Date(res.body.data.payoutsAvailableAt).getTime()).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
    expect(JSON.stringify(res.body)).not.toMatch(/Secret123|password/);
    const write = m.sellerProfile.update.mock.calls[0][0].data;
    expect(write).toMatchObject(NEW);
    expect(write.payoutMethodChangedAt).toBeInstanceOf(Date);
    const audit = m.adminAuditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ actorId: SELLER, action: 'PAYOUT_METHOD_CHANGED', entityType: 'seller_profile', entityId: PROFILE });
    expect(audit.before.payoutPhone).toBe('+243•••••01');
    expect(audit.after.payoutPhone).toBe('+243•••••02');
    expect(JSON.stringify(audit)).not.toMatch(/970000001|990000002|Secret123/);
  });

  it('the sensitive-operation throttle: the 6th change attempt within the hour is a French 429 with Retry-After (5/h per seller)', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).patch('/api/v1/sellers/payout-method').set(asSeller()).send({ ...NEW, password: 'wrong-pass' }).expect(403);
    }
    const res = await request(app.getHttpServer()).patch('/api/v1/sellers/payout-method').set(asSeller()).send({ ...NEW, password: 'Secret123!' }).expect(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.body.error.message).toMatch(/Trop de/);
    expect(m.sellerProfile.update).not.toHaveBeenCalled();
  });

  it('a payout request with an inline destination that differs from the saved one → French 409, nothing created', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/sellers/payouts').set(asSeller()).send(NEW).expect(409);
    expect(res.body.error.message).toMatch(/ne correspond pas à celle enregistrée/);
    expect(m.payout.create).not.toHaveBeenCalled();
    expect(m.sellerEarning.updateMany).not.toHaveBeenCalled();
  });

  it('a payout request during the cooling-off → French 409 naming the reopen time, nothing created', async () => {
    profile(new Date());
    const res = await request(app.getHttpServer()).post('/api/v1/sellers/payouts').set(asSeller()).send({}).expect(409);
    expect(res.body.error.message).toMatch(/modifiée récemment.*à partir du/);
    expect(m.payout.create).not.toHaveBeenCalled();
  });

  it('after the cooling-off the request goes through and snapshots the SAVED destination — even when an old client re-sends it inline', async () => {
    profile(new Date(Date.now() - 25 * 60 * 60 * 1000));
    const res = await request(app.getHttpServer()).post('/api/v1/sellers/payouts').set(asSeller()).send(SAVED).expect(201);
    expect(res.body.data).toMatchObject({ status: 'REQUESTED', ...SAVED });
    expect(m.payout.create.mock.calls[0][0].data).toMatchObject(SAVED);
  });
});
