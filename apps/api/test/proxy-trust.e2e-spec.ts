/**
 * Client-IP trust boundary (security remediation, 2026-10-18).
 *
 * Production topology (docker-compose.prod.yml + nginx/nginx.prod.conf):
 * Cloudflare → nginx (the ONLY published ports, 80/443) → api:5050 on the
 * internal compose networks (the api service publishes no port). nginx
 * restores the visitor address from CF-Connecting-IP only for Cloudflare
 * peers (set_real_ip_from + real_ip_header), then forwards
 * `X-Forwarded-For: $proxy_add_x_forwarded_for` — i.e. whatever the client
 * sent, with the verified `$remote_addr` APPENDED as the rightmost entry.
 *
 * main.ts sets Express `trust proxy` to the number 1: trust exactly ONE hop
 * BY POSITION. `req.ip` is then the rightmost X-Forwarded-For entry,
 * whoever the direct peer is. It is NOT an address allow-list: a peer that
 * reached :5050 directly could pick its own `req.ip`. That is why the
 * boundary is the network (no published api port), not this setting — see
 * the « position, not address » case below, which pins this honestly.
 *
 * `req.ip` is the single identity used by the per-IP @nestjs/throttler
 * backstop (ThrottlerGuard.getTracker → req.ip), by @Ip() (password reset,
 * contact form) and by the session « Appareils » metadata
 * (AuthController.extractDevice → req.ip). OTP / login / reset budgets are
 * additionally keyed on the phone / e-mail (RateLimitService), independent
 * of any IP.
 *
 * Everything here runs the REAL installed Express (resolved through
 * @nestjs/platform-express, exactly what the app loads), its proxy-addr, the
 * Node HTTP parser over loopback sockets, and the real Nest app with the
 * real guards. The trust value is parsed from main.ts itself, so changing
 * the shipped policy fails this file instead of silently diverging.
 * No external service is contacted: e-mail, PostHog and WhatsApp sends are
 * stubbed with spies; Prisma is the shared in-memory mock.
 */
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { readFileSync } from 'fs';
import * as http from 'http';
import * as net from 'net';
import { AddressInfo } from 'net';
import { networkInterfaces } from 'os';
import { dirname, join } from 'path';
import request from 'supertest';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createTestApp, mockPrismaService, resetMocks } from './test-utils';
import { AUTH_LIMITS } from '../src/common/rate-limit/rate-limit.service';
import { EmailService } from '../src/email/email.service';
import { PostHogService } from '../src/analytics/posthog.service';
import { WhatsappService } from '../src/whatsapp/whatsapp.service';

// ── The shipped policy, read from the shipped source ────────────────────────
function shippedTrustProxy(): unknown {
  const source = readFileSync(join(__dirname, '../src/main.ts'), 'utf8').replace(/\/\/.*$/gm, '');
  const calls = [...source.matchAll(/\.set\(\s*['"]trust proxy['"]\s*,\s*([^)]+?)\s*\)/g)];
  expect(calls).toHaveLength(1);
  return JSON.parse(calls[0][1]);
}
const TRUST = shippedTrustProxy();

// ── The Express / proxy-addr the Nest adapter actually loads ────────────────
const nestExpressDir = dirname(require.resolve('@nestjs/platform-express/package.json'));
const expressEntry = require.resolve('express', { paths: [nestExpressDir] });
const expressDir = dirname(expressEntry);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require(expressEntry);
const proxyAddrEntry = require.resolve('proxy-addr', { paths: [expressDir] });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const proxyaddr = require(proxyAddrEntry);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const proxyAddrVersion: string = require(join(dirname(proxyAddrEntry), 'package.json')).version;

const HAS_V6_LOOPBACK = Object.values(networkInterfaces())
  .flat()
  .some((i) => i?.address === '::1');
const itV6 = HAS_V6_LOOPBACK ? it : it.skip;

type Seen = { ip: string; ips: string[]; peer: string };
type Probe = { port: number; close: () => Promise<void> };

/** A bare app on the same Express, reporting what Express derived. */
async function probe(trust: unknown, host: string): Promise<Probe> {
  const app = express();
  if (trust !== undefined) app.set('trust proxy', trust);
  app.get('/whoami', (req: any, res: any) =>
    res.json({ ip: req.ip, ips: req.ips, peer: req.socket.remoteAddress }),
  );
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve());
  });
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Raw HTTP/1.1 over a real socket — header lines exactly as written. */
function rawGet(port: number, host: string, headerLines: string[]): Promise<Seen> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ port, host }, () => {
      socket.write(
        ['GET /whoami HTTP/1.1', 'Host: api.teka.cd', 'Connection: close', ...headerLines, '', ''].join('\r\n'),
      );
    });
    let raw = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => (raw += chunk));
    socket.on('error', reject);
    socket.on('end', () => {
      const [head, body] = raw.split('\r\n\r\n');
      if (!head.startsWith('HTTP/1.1 200')) return reject(new Error(head));
      resolve(JSON.parse(body));
    });
  });
}

const CLIENT = '203.0.113.10'; // the address nginx appends ($remote_addr)
const SPOOFS = ['1.1.1.1', '10.0.0.1, 127.0.0.1', '::1', 'unknown', '198.51.100.7, 2001:db8::bad'];

describe('Trust boundary — shipped policy and installed library', () => {
  it('main.ts trusts exactly one hop, by count (revisit this file before changing it)', () => {
    expect(TRUST).toBe(1);
  });

  it('Express resolves the patched proxy-addr (GHSA-jqcg-44mw-7w3h fixed in 2.0.8)', () => {
    const [maj, min, patch] = proxyAddrVersion.split('.').map(Number);
    expect(maj * 1e6 + min * 1e3 + patch).toBeGreaterThanOrEqual(2_000_008);
  });

  it('@nestjs/throttler tracks req.ip (not req.ips[0] or a header)', async () => {
    const tracker = await ThrottlerGuard.prototype['getTracker'].call(null, {
      ip: CLIENT,
      ips: ['9.9.9.9'],
      headers: { 'x-forwarded-for': '9.9.9.9', 'x-real-ip': '9.9.9.9' },
    });
    expect(tracker).toBe(CLIENT);
  });
});

describe('Express + proxy-addr under the shipped policy (real HTTP parsing)', () => {
  let p: Probe;
  beforeAll(async () => (p = await probe(TRUST, '127.0.0.1')));
  afterAll(async () => p.close());
  const get = (...headers: string[]) => rawGet(p.port, '127.0.0.1', headers);

  it('no X-Forwarded-For → the socket peer', async () => {
    expect((await get()).ip).toBe('127.0.0.1');
  });

  it('nginx-appended client only → that client', async () => {
    const seen = await get(`X-Forwarded-For: ${CLIENT}`);
    expect(seen).toEqual({ ip: CLIENT, ips: [CLIENT], peer: '127.0.0.1' });
  });

  it.each(SPOOFS)('a spoofed prefix (%s) cannot override the rightmost client', async (spoof) => {
    const seen = await get(`X-Forwarded-For: ${spoof}, ${CLIENT}`);
    expect(seen.ip).toBe(CLIENT);
    expect(seen.ips).toEqual([CLIENT]);
  });

  it('two X-Forwarded-For header lines are joined by Node; the last entry still wins', async () => {
    const seen = await get('X-Forwarded-For: 6.6.6.6', `X-Forwarded-For: 7.7.7.7, ${CLIENT}`);
    expect(seen.ip).toBe(CLIENT);
  });

  it('X-Real-IP, CF-Connecting-IP, True-Client-IP and Forwarded are ignored by Express', async () => {
    const decoys = ['X-Real-IP: 6.6.6.6', 'CF-Connecting-IP: 6.6.6.6', 'True-Client-IP: 6.6.6.6', 'Forwarded: for=6.6.6.6'];
    expect((await get(...decoys)).ip).toBe('127.0.0.1');
    expect((await get(...decoys, `X-Forwarded-For: ${CLIENT}`)).ip).toBe(CLIENT);
  });

  it('IPv6 and IPv4-mapped clients are taken verbatim from the rightmost entry', async () => {
    expect((await get('X-Forwarded-For: 6.6.6.6, 2001:db8::7')).ip).toBe('2001:db8::7');
    expect((await get('X-Forwarded-For: 6.6.6.6, ::ffff:203.0.113.7')).ip).toBe('::ffff:203.0.113.7');
  });

  it('position, not address: the hop is trusted whoever the peer is (the network is the boundary)', async () => {
    // A peer that could reach the api port directly would choose its own
    // req.ip. In the reviewed production compose the api publishes no port:
    // nginx is the only EXTERNAL ingress, but other containers on the same
    // private compose network can still reach api:5050 directly.
    expect((await get('X-Forwarded-For: 9.9.9.9')).ip).toBe('9.9.9.9');
    const trustFn = express().set('trust proxy', TRUST).get('trust proxy fn');
    expect(trustFn('8.8.8.8', 0)).toBe(true); // any first hop
    expect(trustFn('127.0.0.1', 1)).toBe(false); // never a second
  });
});

describe('Express with no trusted proxy ignores X-Forwarded-For', () => {
  it.each([
    ['Express default (unset)', undefined],
    ['explicit false', false],
  ])('%s → the socket peer, ips empty', async (_label, trust) => {
    const p = await probe(trust, '127.0.0.1');
    try {
      const seen = await rawGet(p.port, '127.0.0.1', [`X-Forwarded-For: 6.6.6.6, ${CLIENT}`, 'X-Real-IP: 6.6.6.6']);
      expect(seen).toEqual({ ip: '127.0.0.1', ips: [], peer: '127.0.0.1' });
    } finally {
      await p.close();
    }
  });

  itV6('IPv6 peer (::1) and IPv4-mapped peer (dual-stack) are reported as the socket address', async () => {
    const v6 = await probe(false, '::1');
    const dual = await probe(false, '::');
    try {
      expect((await rawGet(v6.port, '::1', [`X-Forwarded-For: ${CLIENT}`])).ip).toBe('::1');
      expect((await rawGet(dual.port, '127.0.0.1', [`X-Forwarded-For: ${CLIENT}`])).ip).toBe('::ffff:127.0.0.1');
    } finally {
      await v6.close();
      await dual.close();
    }
  });

  itV6('shipped policy over an IPv6 peer still takes the rightmost entry', async () => {
    const v6 = await probe(TRUST, '::1');
    try {
      expect((await rawGet(v6.port, '::1', [`X-Forwarded-For: 6.6.6.6, ${CLIENT}`])).ip).toBe(CLIENT);
    } finally {
      await v6.close();
    }
  });
});

/**
 * GHSA-jqcg-44mw-7w3h (proxy-addr < 2.0.8): an IPv4-mapped IPv6 trust subnet
 * with a prefix below 96 was matched on raw 128-bit space, so it spanned
 * EVERY IPv4 address. The shipped numeric policy never compiles a subnet,
 * so the reviewed numeric policy does not exercise this path; live
 * production configuration was not inspected. These pin the patched library in case the
 * policy ever becomes an address list. Each `false` vector was `true` on
 * 2.0.7 (verified locally before the upgrade).
 */
describe('proxy-addr trusted-subnet vectors (patched)', () => {
  it.each([
    ['::ffff:10.0.0.0/8', '203.0.113.9'],
    ['::ffff:10.0.0.0/8', '::ffff:203.0.113.9'],
    ['::ffff:127.0.0.1/8', '8.8.8.8'],
    ['::ffff:127.0.0.1/8', '::1'],
  ])('mapped subnet %s no longer trusts %s', (subnet, addr) => {
    expect(proxyaddr.compile(subnet)(addr)).toBe(false);
    expect(proxyaddr.compile([subnet, '192.0.2.1'])(addr)).toBe(false); // multi-subnet path
  });

  it.each([
    ['::ffff:127.0.0.1/104', '127.0.0.5'],
    ['::ffff:127.0.0.1/104', '::ffff:127.0.0.5'],
    ['10.0.0.0/8', '::ffff:10.1.2.3'],
    ['loopback', '::ffff:127.0.0.1'],
  ])('legitimate subnet %s still trusts %s', (subnet, addr) => {
    expect(proxyaddr.compile(subnet)(addr)).toBe(true);
  });

  it('end to end: a mapped /8 trust no longer lets an IPv4 peer spoof X-Forwarded-For', async () => {
    const p = await probe('::ffff:10.0.0.0/8', '127.0.0.1');
    try {
      expect((await rawGet(p.port, '127.0.0.1', ['X-Forwarded-For: 6.6.6.6'])).ip).toBe('127.0.0.1');
    } finally {
      await p.close();
    }
  });
});

describe('Nest app under the shipped policy — throttler, @Ip, session metadata, OTP', () => {
  let app: INestApplication;
  let sendOtp: jest.SpyInstance;
  let sendResetEmail: jest.SpyInstance;
  let passwordHash: string;
  const seller = (email: string) => ({
    id: 'seller-1', phone: null, email, passwordHash, firstName: 'A', lastName: 'B',
    role: 'SELLER', status: 'ACTIVE', authProvider: 'EMAIL_PASSWORD', deletedAt: null,
  });
  const expressApp = () => app.getHttpAdapter().getInstance();

  beforeAll(async () => {
    app = await createTestApp();
    expressApp().set('trust proxy', TRUST); // the value main.ts ships
    sendOtp = jest.spyOn(app.get(WhatsappService, { strict: false }), 'sendOtp').mockResolvedValue(true);
    sendResetEmail = jest
      .spyOn(app.get(EmailService, { strict: false }), 'sendPasswordResetEmail')
      .mockResolvedValue(undefined as never);
    jest.spyOn(app.get(PostHogService, { strict: false }), 'capture').mockImplementation(() => undefined);
    passwordHash = await bcrypt.hash('Right1234', 4);
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    resetMocks();
    expressApp().set('trust proxy', TRUST);
  });

  const resetRequest = (email: string, xff?: string) => {
    const r = request(app.getHttpServer()).post('/api/v1/auth/password-reset/request');
    return (xff ? r.set('X-Forwarded-For', xff) : r).send({ email });
  };

  it('per-IP backstop (20/h on password reset) cannot be escaped by rotating a spoofed prefix', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 20; i++) {
      // Distinct e-mails keep the per-email budget out of the way.
      await resetRequest(`probe${i}@example.test`, `198.51.100.${i}, ${SPOOFS[i % SPOOFS.length]}, ${CLIENT}`).expect(200);
    }
    const blocked = await resetRequest('probe20@example.test', `192.0.2.99, ${CLIENT}`);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.message).toBe('Trop de requêtes. Veuillez patienter avant de réessayer.');
    // A different nginx-appended client has its own bucket.
    await resetRequest('probe21@example.test', `192.0.2.99, 203.0.113.11`).expect(200);
  });

  it('with no trusted proxy, varying X-Forwarded-For entirely still shares one socket bucket', async () => {
    expressApp().set('trust proxy', false);
    mockPrismaService.user.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 20; i++) {
      await resetRequest(`solo${i}@example.test`, `203.0.113.${100 + i}`).expect(200);
    }
    expect((await resetRequest('solo20@example.test', '203.0.113.200')).status).toBe(429);
  });

  it('@Ip() on password reset stores the rightmost client, not the spoofed prefix', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(seller('seller@example.test'));
    mockPrismaService.passwordResetToken.create.mockResolvedValue({});
    await resetRequest('seller@example.test', `6.6.6.6, ${CLIENT}`).expect(200);
    expect(mockPrismaService.passwordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ipAddress: CLIENT }) }),
    );
    expect(sendResetEmail).toHaveBeenCalledTimes(1); // stubbed — nothing sent
  });

  it('session « Appareils » metadata on login records the same authoritative IP', async () => {
    mockPrismaService.user.findUnique.mockImplementation(async ({ where }: any) => seller(where.email));
    mockPrismaService.user.update.mockResolvedValue({});
    mockPrismaService.refreshToken.create.mockResolvedValue({});
    await request(app.getHttpServer())
      .post('/api/v1/auth/login/email')
      .set('X-Forwarded-For', `6.6.6.6, 2001:db8::1, ${CLIENT}`)
      .set('X-Real-IP', '6.6.6.6')
      .set('CF-Connecting-IP', '6.6.6.6')
      .send({ email: 'seller@example.test', password: 'Right1234' })
      .expect(200);
    expect(mockPrismaService.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ipAddress: CLIENT }) }),
    );
  });

  it('OTP issuance stays phone-keyed: a new client IP per request does not reset the 3-per-phone budget', async () => {
    mockPrismaService.otp.findFirst.mockResolvedValue(null);
    mockPrismaService.otp.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaService.otp.create.mockResolvedValue({});
    mockPrismaService.user.findFirst.mockResolvedValue(null);
    const otp = (client: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/buyer/otp/request')
        .set('X-Forwarded-For', client)
        .send({ phone: '+243999000001' });
    for (let i = 0; i < AUTH_LIMITS.otpRequest.limit; i++) await otp(`203.0.113.${50 + i}`).expect(200);
    expect((await otp('203.0.113.99')).status).toBe(429);
    expect(sendOtp).toHaveBeenCalledTimes(AUTH_LIMITS.otpRequest.limit); // stubbed — nothing sent
  });
});
