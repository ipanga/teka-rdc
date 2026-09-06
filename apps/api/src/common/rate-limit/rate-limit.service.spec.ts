import { AUTH_LIMITS, RateLimitService } from './rate-limit.service';
import { MemoryRateLimitStore } from './rate-limit.store';
import { TooManyRequestsException, waitCopy } from './too-many-requests.exception';

describe('RateLimitService (D8)', () => {
  let store: MemoryRateLimitStore;
  let svc: RateLimitService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-06T10:00:00Z') });
    store = new MemoryRateLimitStore();
    svc = new RateLimitService(store);
  });
  afterEach(() => jest.useRealTimers());

  describe('keys never contain the identifier', () => {
    it('hashes and normalises (trim + lowercase) so "A@x.cd " and "a@x.cd" share a bucket', () => {
      const k1 = RateLimitService.keyFor('login', ' A@X.cd ');
      const k2 = RateLimitService.keyFor('login', 'a@x.cd');
      expect(k1).toBe(k2);
      expect(k1.startsWith('login:')).toBe(true);
      expect(k1).not.toContain('x.cd');
      expect(k1).toMatch(/^login:[0-9a-f]{40}$/);
    });
    it('is scope-specific', () => {
      expect(RateLimitService.keyFor('login', 'a@x.cd')).not.toBe(RateLimitService.keyFor('register', 'a@x.cd'));
    });
  });

  describe('fixed window', () => {
    it('allows exactly `limit` hits then refuses with the time left in the window', async () => {
      const { limit, windowSeconds } = AUTH_LIMITS.otpRequest;
      for (let i = 1; i <= limit; i++) {
        expect(await svc.hit('otpRequest', '+243999000001')).toMatchObject({ allowed: true, count: i });
      }
      jest.advanceTimersByTime(100_000);
      const d = await svc.hit('otpRequest', '+243999000001');
      expect(d.allowed).toBe(false);
      expect(d.count).toBe(limit + 1);
      expect(d.retryAfterSeconds).toBe(windowSeconds - 100);
    });

    it('starts a fresh window once the previous one expired', async () => {
      for (let i = 0; i <= AUTH_LIMITS.otpRequest.limit; i++) await svc.hit('otpRequest', 'p');
      expect((await svc.hit('otpRequest', 'p')).allowed).toBe(false);
      jest.advanceTimersByTime(AUTH_LIMITS.otpRequest.windowSeconds * 1000 + 1);
      expect(await svc.hit('otpRequest', 'p')).toMatchObject({ allowed: true, count: 1 });
    });

    it('parallel hits are counted individually (no lost update)', async () => {
      const results = await Promise.all(Array.from({ length: 20 }, () => svc.hit('otpVerify', 'p')));
      const counts = results.map((r) => r.count).sort((a, b) => a - b);
      expect(counts).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      expect(results.filter((r) => r.allowed)).toHaveLength(AUTH_LIMITS.otpVerify.limit);
    });

    it('clear() resets the bucket', async () => {
      for (let i = 0; i <= 3; i++) await svc.hit('otpRequest', 'p');
      await svc.clear('otpRequest', 'p');
      expect(await svc.hit('otpRequest', 'p')).toMatchObject({ allowed: true, count: 1 });
    });
  });

  describe('lock (login)', () => {
    it('the limit-th failure is still reported as a failure but engages the lock; status() sees it without counting', async () => {
      const { limit, lockSeconds } = AUTH_LIMITS.login;
      for (let i = 0; i < limit - 1; i++) {
        expect((await svc.hit('login', 'a@x.cd')).allowed).toBe(true);
        expect((await svc.status('login', 'a@x.cd')).allowed).toBe(true);
      }
      // 10th failure: counted as allowed (caller answers 401) — and locked from now on.
      expect((await svc.hit('login', 'a@x.cd')).allowed).toBe(true);
      expect(await svc.status('login', 'a@x.cd')).toMatchObject({ allowed: false, retryAfterSeconds: lockSeconds });
      const over = await svc.hit('login', 'a@x.cd');
      expect(over.allowed).toBe(false);
      expect(over.retryAfterSeconds).toBe(lockSeconds);

      jest.advanceTimersByTime(60_000);
      const status = await svc.status('login', 'a@x.cd');
      expect(status).toMatchObject({ allowed: false, retryAfterSeconds: lockSeconds! - 60 });
      // status() did not count a hit
      expect((await store.get(RateLimitService.keyFor('login', 'a@x.cd')))!.count).toBe(limit + 1);
    });

    it('the lock outlives the window and is not extended by further attempts', async () => {
      const { limit, lockSeconds, windowSeconds } = AUTH_LIMITS.login;
      for (let i = 0; i < limit; i++) await svc.hit('login', 'a@x.cd');
      const first = (await store.get(RateLimitService.keyFor('login', 'a@x.cd')))!.lockedUntil!.getTime();
      jest.advanceTimersByTime(windowSeconds * 1000 - 1000);
      const again = await svc.hit('login', 'a@x.cd');
      expect(again.allowed).toBe(false);
      expect((await store.get(RateLimitService.keyFor('login', 'a@x.cd')))!.lockedUntil!.getTime()).toBe(first);
      jest.advanceTimersByTime(lockSeconds! * 1000);
      expect((await svc.status('login', 'a@x.cd')).allowed).toBe(true);
    });

    it('assertNotBlocked throws a TooManyRequestsException carrying Retry-After and French copy', async () => {
      for (let i = 0; i <= AUTH_LIMITS.login.limit; i++) await svc.hit('login', 'a@x.cd');
      await expect(svc.assertNotBlocked('login', 'a@x.cd')).rejects.toMatchObject({
        status: 429,
        retryAfterSeconds: AUTH_LIMITS.login.lockSeconds,
        message: expect.stringMatching(/^Trop de tentatives\. Veuillez patienter 15 min/),
      });
      await expect(svc.assertNotBlocked('login', 'other@x.cd')).resolves.toBeUndefined();
    });
  });

  describe('enforce', () => {
    it('resolves under the limit and throws a 429 above it', async () => {
      for (let i = 0; i < AUTH_LIMITS.passwordReset.limit; i++) {
        await expect(svc.enforce('passwordReset', 'a@x.cd')).resolves.toBeUndefined();
      }
      const err = await svc.enforce('passwordReset', 'a@x.cd').catch((e) => e);
      expect(err).toBeInstanceOf(TooManyRequestsException);
      expect(err.getStatus()).toBe(429);
      expect(err.retryAfterSeconds).toBe(AUTH_LIMITS.passwordReset.windowSeconds);
    });
  });

  describe('sweepExpired', () => {
    it('removes rows whose window and lock are over an hour old, keeps the rest', async () => {
      await svc.hit('otpRequest', 'old');
      jest.advanceTimersByTime((AUTH_LIMITS.otpRequest.windowSeconds + 3601) * 1000);
      await svc.hit('otpRequest', 'fresh');
      await svc.sweepExpired();
      expect(await store.get(RateLimitService.keyFor('otpRequest', 'old'))).toBeNull();
      expect(await store.get(RateLimitService.keyFor('otpRequest', 'fresh'))).not.toBeNull();
    });
  });

  describe('waitCopy', () => {
    it('speaks seconds up to 90 s, then whole minutes', () => {
      expect(waitCopy(1)).toBe('Veuillez patienter 1 s avant de réessayer.');
      expect(waitCopy(90)).toBe('Veuillez patienter 90 s avant de réessayer.');
      expect(waitCopy(91)).toBe('Veuillez patienter 2 min avant de réessayer.');
      expect(waitCopy(900)).toBe('Veuillez patienter 15 min avant de réessayer.');
      expect(waitCopy(902)).toBe('Veuillez patienter 15 min avant de réessayer.');
    });
  });

  describe('AUTH_LIMITS — documented defaults', () => {
    it('matches docs/api-reference.md → Rate limits', () => {
      expect(AUTH_LIMITS).toEqual({
        otpRequest: { limit: 3, windowSeconds: 600 },
        otpVerify: { limit: 10, windowSeconds: 900 },
        login: { limit: 10, windowSeconds: 900, lockSeconds: 900 },
        passwordReset: { limit: 3, windowSeconds: 3600 },
        register: { limit: 3, windowSeconds: 3600 },
        refresh: { limit: 60, windowSeconds: 900 },
        csvExport: { limit: 10, windowSeconds: 600 },
        upload: { limit: 30, windowSeconds: 600 },
      });
    });
  });
});
