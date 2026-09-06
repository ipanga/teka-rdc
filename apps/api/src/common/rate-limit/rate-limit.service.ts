import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { RateLimitStore } from './rate-limit.store';
import { TooManyRequestsException, waitCopy } from './too-many-requests.exception';

export interface RateLimitPolicy {
  /** Allowed hits inside one window. */
  limit: number;
  windowSeconds: number;
  /** When set, exceeding `limit` also locks the key for this long. */
  lockSeconds?: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

/**
 * D8 (2026-09-06) — identifier-keyed authentication throttling.
 *
 * Every limit is keyed on the identity under attack (normalised phone, email,
 * session, user id) — never only on the client IP, which behind Cloudflare
 * and DRC carrier NAT is shared by thousands of legitimate users. The
 * per-IP @nestjs/throttler stays as an outer backstop. Keys are
 * `scope:sha256(identifier)` so the table never stores a raw phone or email;
 * logs carry the same truncated hash.
 *
 * The final limits are ordinary constants below (`AUTH_LIMITS`): they are
 * initial security parameters, tuned in one place.
 */
export const AUTH_LIMITS = {
  /** WhatsApp OTP issuance per phone (request + resend share the bucket). */
  otpRequest: { limit: 3, windowSeconds: 600 },
  /** OTP verification calls per phone; the per-code 5-attempt cap still applies. */
  otpVerify: { limit: 10, windowSeconds: 900 },
  /** Failed email logins per email; the `limit`-th failure locks for `lockSeconds`. Success clears the bucket. */
  login: { limit: 10, windowSeconds: 900, lockSeconds: 900 },
  /** Password-reset emails per address. */
  passwordReset: { limit: 3, windowSeconds: 3600 },
  /** Seller registrations per email address. */
  register: { limit: 3, windowSeconds: 3600 },
  /** Refreshes per refresh token (hash of the token itself). */
  refresh: { limit: 60, windowSeconds: 900 },
  /** CSV exports per admin. */
  csvExport: { limit: 10, windowSeconds: 600 },
  /** Image uploads (product images, avatar) per user. */
  upload: { limit: 30, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitScope = keyof typeof AUTH_LIMITS;

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly store: RateLimitStore) {}

  /** Stable, PII-free key. */
  static keyFor(scope: RateLimitScope, identifier: string): string {
    const hash = createHash('sha256')
      .update(identifier.trim().toLowerCase())
      .digest('hex')
      .slice(0, 40);
    return `${scope}:${hash}`;
  }

  /** Count one hit and decide; never throws on its own. */
  async hit(scope: RateLimitScope, identifier: string): Promise<RateLimitDecision> {
    const policy: RateLimitPolicy = AUTH_LIMITS[scope];
    const key = RateLimitService.keyFor(scope, identifier);
    const now = Date.now();
    const state = await this.store.hit(key, policy.windowSeconds);
    if (state.lockedUntil && state.lockedUntil.getTime() > now) {
      return { allowed: false, count: state.count, retryAfterSeconds: secondsUntil(state.lockedUntil, now) };
    }
    if (state.count <= policy.limit) {
      if (policy.lockSeconds && state.count === policy.limit) {
        // The hit that reaches the limit (e.g. the 10th failed login) is still
        // reported as an ordinary failure, but it engages the lock: from now
        // on status()/assertNotBlocked refuse even a correct password.
        await this.store.lock(key, policy.lockSeconds);
        this.logger.warn(`[rate-limit] ${scope} locked for ${key.slice(0, 20)}… (${policy.lockSeconds}s)`);
      }
      return { allowed: true, count: state.count, retryAfterSeconds: 0 };
    }
    let until = state.expiresAt;
    if (policy.lockSeconds) {
      const locked = await this.store.lock(key, policy.lockSeconds);
      if (locked?.lockedUntil) until = locked.lockedUntil;
    } else if (state.count === policy.limit + 1) {
      this.logger.warn(`[rate-limit] ${scope} exceeded for ${key.slice(0, 20)}…`);
    }
    return { allowed: false, count: state.count, retryAfterSeconds: secondsUntil(until, now) };
  }

  /** Count one hit and throw a French 429 (with Retry-After) when over. */
  async enforce(scope: RateLimitScope, identifier: string, message?: string): Promise<void> {
    const decision = await this.hit(scope, identifier);
    if (!decision.allowed) {
      throw new TooManyRequestsException(
        message ?? `Trop de tentatives. ${waitCopy(decision.retryAfterSeconds)}`,
        decision.retryAfterSeconds,
      );
    }
  }

  /** Is the key currently locked or over its limit? Does not count a hit. */
  async status(scope: RateLimitScope, identifier: string): Promise<RateLimitDecision> {
    const policy: RateLimitPolicy = AUTH_LIMITS[scope];
    const state = await this.store.get(RateLimitService.keyFor(scope, identifier));
    const now = Date.now();
    if (!state) return { allowed: true, count: 0, retryAfterSeconds: 0 };
    if (state.lockedUntil && state.lockedUntil.getTime() > now) {
      return { allowed: false, count: state.count, retryAfterSeconds: secondsUntil(state.lockedUntil, now) };
    }
    if (state.expiresAt.getTime() > now && state.count > policy.limit) {
      return { allowed: false, count: state.count, retryAfterSeconds: secondsUntil(state.expiresAt, now) };
    }
    return { allowed: true, count: state.expiresAt.getTime() > now ? state.count : 0, retryAfterSeconds: 0 };
  }

  /** Throw the 429 if the key is locked / over (used before a login attempt). */
  async assertNotBlocked(scope: RateLimitScope, identifier: string, message?: string): Promise<void> {
    const decision = await this.status(scope, identifier);
    if (!decision.allowed) {
      throw new TooManyRequestsException(
        message ?? `Trop de tentatives. ${waitCopy(decision.retryAfterSeconds)}`,
        decision.retryAfterSeconds,
      );
    }
  }

  async clear(scope: RateLimitScope, identifier: string): Promise<void> {
    await this.store.clear(RateLimitService.keyFor(scope, identifier));
  }

  /** Hourly sweep of expired, unlocked rows keeps the table bounded. */
  @Cron(CronExpression.EVERY_HOUR)
  async sweepExpired(): Promise<void> {
    try {
      const n = await this.store.sweep(new Date(Date.now() - 60 * 60 * 1000));
      if (n > 0) this.logger.log(`[rate-limit] swept ${n} expired rows`);
    } catch (e) {
      this.logger.warn(`[rate-limit] sweep failed: ${(e as Error).message}`);
    }
  }
}

function secondsUntil(date: Date, now: number): number {
  return Math.max(1, Math.ceil((date.getTime() - now) / 1000));
}
