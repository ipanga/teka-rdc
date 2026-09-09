import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdentityThrottle, IDENTITY_THROTTLE_KEY } from './identity-throttle.decorator';
import { IdentityThrottleGuard } from './identity-throttle.guard';
import { AUTH_LIMITS, RateLimitService } from './rate-limit.service';
import { MemoryRateLimitStore } from './rate-limit.store';

function ctx(handler: any, user?: { userId: string }): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('IdentityThrottleGuard (D8)', () => {
  const svc = new RateLimitService(new MemoryRateLimitStore());
  const guard = new IdentityThrottleGuard(new Reflector(), svc);

  class Ctl {
    @IdentityThrottle('upload')
    upload() {}
    plain() {}
  }

  it('sets the metadata key', () => {
    expect(Reflect.getMetadata(IDENTITY_THROTTLE_KEY, Ctl.prototype.upload)).toBe('upload');
  });

  it('routes without the decorator are never counted', async () => {
    for (let i = 0; i < 100; i++) await expect(guard.canActivate(ctx(Ctl.prototype.plain, { userId: 'u1' }))).resolves.toBe(true);
  });

  it('counts per user id: limit allowed, then 429, other user unaffected', async () => {
    for (let i = 0; i < AUTH_LIMITS.upload.limit; i++) {
      await expect(guard.canActivate(ctx(Ctl.prototype.upload, { userId: 'u1' }))).resolves.toBe(true);
    }
    await expect(guard.canActivate(ctx(Ctl.prototype.upload, { userId: 'u1' }))).rejects.toMatchObject({ status: 429 });
    await expect(guard.canActivate(ctx(Ctl.prototype.upload, { userId: 'u2' }))).resolves.toBe(true);
  });

  it('leaves unauthenticated requests to the auth guard (no anonymous bucket)', async () => {
    await expect(guard.canActivate(ctx(Ctl.prototype.upload, undefined))).resolves.toBe(true);
  });
});
