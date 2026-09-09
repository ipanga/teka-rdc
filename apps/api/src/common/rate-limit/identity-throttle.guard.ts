import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IDENTITY_THROTTLE_KEY } from './identity-throttle.decorator';
import { RateLimitService, type RateLimitScope } from './rate-limit.service';

/**
 * Runs after JwtAuthGuard / RolesGuard: keys the limit on `req.user.userId`,
 * so a shared-IP crowd never trips it and a single account cannot escape it
 * by changing IP. Routes without @IdentityThrottle are untouched.
 */
@Injectable()
export class IdentityThrottleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<RateLimitScope | undefined>(
      IDENTITY_THROTTLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!scope) return true;
    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.userId;
    if (!userId) return true; // unauthenticated requests are handled by the auth guard
    await this.rateLimit.enforce(scope, userId);
    return true;
  }
}
