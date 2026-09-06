import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('@sentry/node', () => ({
  captureMessage: jest.fn(),
}));

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

function makeConfig(): ConfigService {
  const defaults: Record<string, string> = {
    NODE_ENV: 'test',
    JWT_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '7d',
  };
  return {
    get: (key: string, fallback?: any) => defaults[key] ?? fallback,
  } as unknown as ConfigService;
}

function makeJwt() {
  return {
    // refresh payload: a valid, non-expired refresh JWT for user u1 / jti t1
    verify: jest.fn().mockReturnValue({ sub: 'u1', jti: 't1', type: 'refresh' }),
    sign: jest.fn().mockReturnValue('signed-token'),
  } as any;
}

function makePrisma() {
  return {
    refreshToken: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'u1',
        role: 'SELLER',
        phone: null,
        status: 'ACTIVE',
      }),
    },
  } as any;
}

function makeService(prisma: any, jwt: any) {
  return new AuthService(
    prisma,
    jwt,
    makeConfig(),
    {} as any,
    {} as any,
    {
      enforce: jest.fn().mockResolvedValue(undefined),
      assertNotBlocked: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      hit: jest.fn().mockResolvedValue({ allowed: true, count: 1, retryAfterSeconds: 0 }),
    } as any,
  );
}

describe('AuthService.refreshTokens — rotation race vs replay', () => {
  beforeEach(() => {
    mockedBcrypt.compare.mockResolvedValue(true as never);
    mockedBcrypt.hash.mockResolvedValue('new-hash' as never);
  });

  it('normal rotation (token not yet revoked): revokes the used token, no revoke-all', async () => {
    const prisma = makePrisma();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      tokenHash: 'stored-hash',
      revokedAt: null,
    });

    const tokens = await makeService(prisma, makeJwt()).refreshTokens('raw');

    expect(tokens.accessToken).toBeDefined();
    // exactly one targeted revoke of the consumed token; no revoke-all
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('benign race (token revoked <15s ago): re-issues WITHOUT revoke-all', async () => {
    const prisma = makePrisma();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      tokenHash: 'stored-hash',
      revokedAt: new Date(Date.now() - 1_000), // 1s ago — within grace
    });

    const tokens = await makeService(prisma, makeJwt()).refreshTokens('raw');

    expect(tokens.accessToken).toBeDefined();
    // a fresh token row is created, but NO revoke-all
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('replay (token revoked long ago): revokes ALL tokens and throws', async () => {
    const prisma = makePrisma();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      tokenHash: 'stored-hash',
      revokedAt: new Date(Date.now() - 60_000), // 60s ago — beyond grace
    });

    await expect(
      makeService(prisma, makeJwt()).refreshTokens('raw'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // revoke-all: updateMany scoped to the user with the revokedAt:null filter
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('unknown jti: rejects without revoke-all', async () => {
    const prisma = makePrisma();
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(
      makeService(prisma, makeJwt()).refreshTokens('raw'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('hash mismatch: rejects without revoke-all', async () => {
    mockedBcrypt.compare.mockResolvedValue(false as never);
    const prisma = makePrisma();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      tokenHash: 'stored-hash',
      revokedAt: null,
    });

    await expect(
      makeService(prisma, makeJwt()).refreshTokens('raw'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('AuthService.logout — session scoping', () => {
  it('with a jti: revokes ONLY that session (not all)', async () => {
    const prisma = makePrisma();
    await makeService(prisma, makeJwt()).logout('u1', 't1');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', userId: 'u1' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('without a jti: revokes ALL sessions', async () => {
    const prisma = makePrisma();
    await makeService(prisma, makeJwt()).logout('u1');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe('AuthService.loginWithEmail — D8 per-email failure budget', () => {
  beforeEach(() => {
    mockedBcrypt.compare.mockClear();
  });
  function build(userRow: any) {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(userRow);
    prisma.user.update = jest.fn().mockResolvedValue({});
    const rateLimit = {
      enforce: jest.fn().mockResolvedValue(undefined),
      assertNotBlocked: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      hit: jest.fn(),
    };
    const svc = new AuthService(prisma, makeJwt(), makeConfig(), {} as any, { capture: jest.fn() } as any, rateLimit as any);
    return { svc, prisma, rateLimit };
  }
  const seller = { id: 'u1', role: 'SELLER', phone: null, email: 's@x.cd', passwordHash: 'h', status: 'ACTIVE', deletedAt: null };

  it('a locked email is refused before any password work, with the same copy for known and unknown addresses', async () => {
    const { svc, rateLimit } = build(seller);
    rateLimit.assertNotBlocked.mockRejectedValue(Object.assign(new Error('Trop de tentatives.'), { status: 429 }));
    await expect(svc.loginWithEmail({ email: 's@x.cd', password: 'Whatever1' })).rejects.toMatchObject({ status: 429 });
    expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    expect(rateLimit.enforce).not.toHaveBeenCalled();
  });

  it('a wrong password counts one failure and still answers 401', async () => {
    const { svc, rateLimit } = build(seller);
    mockedBcrypt.compare.mockResolvedValue(false as never);
    await expect(svc.loginWithEmail({ email: 's@x.cd', password: 'Wrong1234' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rateLimit.enforce).toHaveBeenCalledWith('login', 's@x.cd');
    expect(rateLimit.clear).not.toHaveBeenCalled();
  });

  it('an unknown email counts identically (no existence oracle)', async () => {
    const { svc, rateLimit } = build(null);
    await expect(svc.loginWithEmail({ email: 'nobody@x.cd', password: 'Wrong1234' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rateLimit.enforce).toHaveBeenCalledWith('login', 'nobody@x.cd');
  });

  it('a successful login clears the bucket', async () => {
    const { svc, rateLimit } = build(seller);
    mockedBcrypt.compare.mockResolvedValue(true as never);
    mockedBcrypt.hash.mockResolvedValue('new-hash' as never);
    await svc.loginWithEmail({ email: 's@x.cd', password: 'Right1234' });
    expect(rateLimit.clear).toHaveBeenCalledWith('login', 's@x.cd');
    expect(rateLimit.enforce).not.toHaveBeenCalled();
  });
});

describe('AuthService — D8 per-identity budgets on reset / register / refresh', () => {
  function build() {
    const prisma = makePrisma();
    const rateLimit = {
      enforce: jest.fn().mockResolvedValue(undefined),
      assertNotBlocked: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      hit: jest.fn(),
    };
    const logs: string[] = [];
    const svc = new AuthService(prisma, makeJwt(), makeConfig(), { sendPasswordResetEmail: jest.fn() } as any, { capture: jest.fn() } as any, rateLimit as any);
    jest.spyOn((svc as any).logger, 'log').mockImplementation((m: any) => { logs.push(String(m)); });
    return { svc, prisma, rateLimit, logs };
  }

  it('password reset: unknown email is counted, answered 200, and never logged verbatim', async () => {
    const { svc, prisma, rateLimit, logs } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await svc.requestPasswordReset({ email: 'ghost@x.cd' } as any);
    expect(res.message).toMatch(/Si un compte existe/);
    expect(rateLimit.enforce).toHaveBeenCalledWith('passwordReset', 'ghost@x.cd');
    expect(logs.join('\n')).not.toContain('ghost@x.cd');
  });

  it('password reset: 429 from the budget surfaces before the lookup', async () => {
    const { svc, prisma, rateLimit } = build();
    rateLimit.enforce.mockRejectedValue(Object.assign(new Error('x'), { status: 429 }));
    await expect(svc.requestPasswordReset({ email: 'a@x.cd' } as any)).rejects.toMatchObject({ status: 429 });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('register: the per-email budget is counted before the 409 existence check', async () => {
    const { svc, prisma, rateLimit } = build();
    rateLimit.enforce.mockRejectedValue(Object.assign(new Error('x'), { status: 429 }));
    await expect(
      svc.registerSellerWithEmail({ email: 'a@x.cd', password: 'Passw0rd', firstName: 'A', lastName: 'B' } as any),
    ).rejects.toMatchObject({ status: 429 });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('refresh: the budget is keyed on the presented token and checked before verification', async () => {
    const { svc, rateLimit } = build();
    rateLimit.enforce.mockRejectedValue(Object.assign(new Error('x'), { status: 429 }));
    await expect(svc.refreshTokens('rt-1')).rejects.toMatchObject({ status: 429 });
    expect(rateLimit.enforce).toHaveBeenCalledWith('refresh', 'rt-1');
  });
});

