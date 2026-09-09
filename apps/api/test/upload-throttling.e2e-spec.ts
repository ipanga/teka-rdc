import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { createTestApp, mockPrismaService, resetMocks } from './test-utils';

/**
 * S13 (2026-09-09) — every upload endpoint is throttled per user.
 *
 * `POST /v1/sellers/documents` was the gap that mattered: it is open to any
 * authenticated BUYER, creates a PRIVATE Cloudinary asset per call, and
 * writes no row and no owner binding — so without a per-user budget a single
 * OTP-registered account could mint unbounded private storage. The
 * verification upload was bounded by supersession but equally unthrottled.
 *
 * These run through the real guards and the real IdentityThrottleGuard
 * (AUTH_LIMITS.upload = 30 per 10 minutes, keyed on the user id, never on a
 * phone or an email).
 */
const BUYER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SELLER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

const USERS: Record<string, Record<string, unknown>> = {
  [BUYER]: { id: BUYER, role: 'BUYER', status: 'ACTIVE', phone: '+243999000101', email: null, deletedAt: null },
  [SELLER]: { id: SELLER, role: 'SELLER', status: 'ACTIVE', phone: null, email: 'marie@example.cd', deletedAt: null },
};

describe('Upload throttling (e2e) — S13', () => {
  let app: INestApplication;
  let buyerToken: string;
  let sellerToken: string;
  const m = mockPrismaService as Record<string, any>;
  const asBuyer = () => ({ Authorization: `Bearer ${buyerToken}`, 'X-Teka-Surface': 'buyer' });
  const asSeller = () => ({ Authorization: `Bearer ${sellerToken}`, 'X-Teka-Surface': 'seller' });

  beforeAll(async () => {
    app = await createTestApp();
    const jwt = app.get(JwtService, { strict: false });
    buyerToken = jwt.sign({ sub: BUYER, role: 'BUYER', phone: '+243999000101', jti: 'e2e-s13-buyer' });
    sellerToken = jwt.sign({ sub: SELLER, role: 'SELLER', phone: null, jti: 'e2e-s13-seller' });
  });
  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    resetMocks();
    m.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(USERS[where.id] ?? null),
    );
  });

  it('the application-document upload is throttled: a French 429 with Retry-After arrives well before an account could mint unbounded assets', async () => {
    const send = () =>
      request(app.getHttpServer())
        .post('/api/v1/sellers/documents')
        .set(asBuyer())
        .attach('document', PNG, { filename: 'id.png', contentType: 'image/png' });

    // Two layers guard this route: @Throttle 20/min per IP (the backstop) and
    // @IdentityThrottle('upload') = AUTH_LIMITS.upload 30/10 min per user id.
    // Whichever bites first, the contract is the same: a French 429 carrying
    // Retry-After, and it must arrive quickly — before the route was
    // throttled at all, this loop would have run unbounded.
    let blocked: request.Response | null = null;
    let allowed = 0;
    for (let i = 0; i < 40 && !blocked; i++) {
      const res = await send();
      if (res.status === 429) blocked = res;
      else allowed++;
    }

    expect(blocked).not.toBeNull();
    expect(allowed).toBeLessThanOrEqual(30);
    expect(blocked!.headers['retry-after']).toBeDefined();
    expect(blocked!.body).toMatchObject({ success: false, error: { status: 429 } });
    expect(blocked!.body.error.message).toMatch(/Trop de/);
    // The throttle keys on the user id — no phone, no email in the response.
    expect(JSON.stringify(blocked!.body)).not.toMatch(/\+243|@example\.cd/);
  });

  it('the budget is per user: a different account is unaffected by the first one being blocked', async () => {
    // The buyer's budget is spent by the previous test (same app, same
    // store). A different account on its own route is unaffected.
    const res = await request(app.getHttpServer())
      .post('/api/v1/sellers/verification/documents')
      .set(asSeller())
      .field('type', 'RCCM')
      .attach('document', PNG, { filename: 'rccm.png', contentType: 'image/png' });
    expect(res.status).not.toBe(429);
  });

  it('the upload routes still require a session', async () => {
    for (const url of ['/api/v1/sellers/documents', '/api/v1/sellers/verification/documents']) {
      const res = await request(app.getHttpServer())
        .post(url)
        .attach('document', PNG, { filename: 'x.png', contentType: 'image/png' });
      expect(res.status).toBe(401);
    }
  });
});
