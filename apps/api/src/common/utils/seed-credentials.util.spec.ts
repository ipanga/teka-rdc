import { credentialsForSeed } from './seed-credentials.util';

const SEEDED = {
  authProvider: 'EMAIL_PASSWORD' as const,
  passwordHash: '$2b$10$seeded',
  passwordSetAt: new Date('2026-01-01'),
};

describe('credentialsForSeed (seller-login-after-upgrade regression)', () => {
  it('PRESERVES an existing password — returns {} so the seed never overwrites it', () => {
    // The core regression: an account with a real password must keep it across
    // every re-seed (prod DB upgrades), so the seller can still log in.
    expect(credentialsForSeed('$2b$10$realOwnerHash', SEEDED)).toEqual({});
  });

  it('seeds credentials for a password-less account (null hash)', () => {
    expect(credentialsForSeed(null, SEEDED)).toBe(SEEDED);
  });

  it('seeds credentials for a password-less account (undefined hash)', () => {
    expect(credentialsForSeed(undefined, SEEDED)).toBe(SEEDED);
  });

  it('treats an empty-string hash as no password (seeds credentials)', () => {
    expect(credentialsForSeed('', SEEDED)).toBe(SEEDED);
  });

  it('spreading the result never injects passwordHash onto an existing account', () => {
    const update = {
      role: 'SELLER',
      status: 'ACTIVE',
      emailVerified: true,
      ...credentialsForSeed('$2b$10$realOwnerHash', SEEDED),
    };
    expect(update).not.toHaveProperty('passwordHash');
    expect(update).not.toHaveProperty('passwordSetAt');
    expect(update).not.toHaveProperty('authProvider');
  });
});
