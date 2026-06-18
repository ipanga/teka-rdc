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
