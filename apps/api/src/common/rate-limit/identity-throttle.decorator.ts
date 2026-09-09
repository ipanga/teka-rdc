import { SetMetadata } from '@nestjs/common';
import type { RateLimitScope } from './rate-limit.service';

export const IDENTITY_THROTTLE_KEY = 'teka:identity-throttle';

/**
 * Per-authenticated-user limit (scope from AUTH_LIMITS) enforced by
 * IdentityThrottleGuard — complements the per-IP @Throttle backstop.
 */
export const IdentityThrottle = (scope: RateLimitScope) =>
  SetMetadata(IDENTITY_THROTTLE_KEY, scope);
