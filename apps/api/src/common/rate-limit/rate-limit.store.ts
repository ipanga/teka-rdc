import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** What one atomic "hit" of a bucket returns. */
export interface BucketState {
  count: number;
  expiresAt: Date;
  lockedUntil: Date | null;
}

/**
 * Storage contract for identifier-keyed throttling. `hit` MUST be atomic
 * under concurrent calls: two parallel hits on the same key must yield
 * counts n and n+1, never the same count. `lock` sets a temporary lock only
 * when none is active. `get` never mutates.
 */
export abstract class RateLimitStore {
  abstract hit(key: string, windowSeconds: number): Promise<BucketState>;
  abstract lock(key: string, lockSeconds: number): Promise<BucketState | null>;
  abstract get(key: string): Promise<BucketState | null>;
  abstract clear(key: string): Promise<void>;
  abstract sweep(now: Date): Promise<number>;
}

/**
 * Production store: PostgreSQL `auth_rate_limits`, shared by every API
 * container and durable across restarts. One INSERT … ON CONFLICT statement
 * increments (or restarts an expired window) atomically — no read-then-write.
 */
@Injectable()
export class PrismaRateLimitStore extends RateLimitStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async hit(key: string, windowSeconds: number): Promise<BucketState> {
    const rows = await this.prisma.$queryRaw<
      Array<{ count: number; expiresAt: Date; lockedUntil: Date | null }>
    >`
      INSERT INTO "auth_rate_limits" ("key", "count", "expiresAt", "lockedUntil", "updatedAt")
      VALUES (${key}, 1, NOW() + (${windowSeconds}::int * INTERVAL '1 second'), NULL, NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "auth_rate_limits"."expiresAt" > NOW()
                       THEN "auth_rate_limits"."count" + 1 ELSE 1 END,
        "expiresAt" = CASE WHEN "auth_rate_limits"."expiresAt" > NOW()
                           THEN "auth_rate_limits"."expiresAt"
                           ELSE NOW() + (${windowSeconds}::int * INTERVAL '1 second') END,
        "lockedUntil" = CASE WHEN "auth_rate_limits"."lockedUntil" > NOW()
                             THEN "auth_rate_limits"."lockedUntil" ELSE NULL END,
        "updatedAt" = NOW()
      RETURNING "count", "expiresAt", "lockedUntil"`;
    return rows[0];
  }

  async lock(key: string, lockSeconds: number): Promise<BucketState | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ count: number; expiresAt: Date; lockedUntil: Date | null }>
    >`
      UPDATE "auth_rate_limits"
      SET "lockedUntil" = NOW() + (${lockSeconds}::int * INTERVAL '1 second'),
          "updatedAt" = NOW()
      WHERE "key" = ${key}
        AND ("lockedUntil" IS NULL OR "lockedUntil" < NOW())
      RETURNING "count", "expiresAt", "lockedUntil"`;
    return rows[0] ?? null;
  }

  async get(key: string): Promise<BucketState | null> {
    const row = await this.prisma.authRateLimit.findUnique({
      where: { key },
      select: { count: true, expiresAt: true, lockedUntil: true },
    });
    return row ?? null;
  }

  async clear(key: string): Promise<void> {
    await this.prisma.authRateLimit.deleteMany({ where: { key } });
  }

  async sweep(now: Date): Promise<number> {
    const res = await this.prisma.authRateLimit.deleteMany({
      where: {
        expiresAt: { lt: now },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
    });
    return res.count;
  }
}

/**
 * Process-local store with the same semantics — used by the e2e suite and
 * available for local experiments. JavaScript's single-threaded event loop
 * makes each method atomic with respect to concurrent requests, which is
 * exactly the property the Postgres statement provides across containers.
 */
export class MemoryRateLimitStore extends RateLimitStore {
  private readonly rows = new Map<string, BucketState>();

  async hit(key: string, windowSeconds: number): Promise<BucketState> {
    const now = Date.now();
    const cur = this.rows.get(key);
    const next: BucketState =
      cur && cur.expiresAt.getTime() > now
        ? { count: cur.count + 1, expiresAt: cur.expiresAt, lockedUntil: cur.lockedUntil && cur.lockedUntil.getTime() > now ? cur.lockedUntil : null }
        : { count: 1, expiresAt: new Date(now + windowSeconds * 1000), lockedUntil: cur?.lockedUntil && cur.lockedUntil.getTime() > now ? cur.lockedUntil : null };
    this.rows.set(key, next);
    return { ...next };
  }

  async lock(key: string, lockSeconds: number): Promise<BucketState | null> {
    const cur = this.rows.get(key);
    if (!cur) return null;
    if (cur.lockedUntil && cur.lockedUntil.getTime() > Date.now()) return null;
    const next = { ...cur, lockedUntil: new Date(Date.now() + lockSeconds * 1000) };
    this.rows.set(key, next);
    return { ...next };
  }

  async get(key: string): Promise<BucketState | null> {
    const cur = this.rows.get(key);
    return cur ? { ...cur } : null;
  }

  async clear(key: string): Promise<void> {
    this.rows.delete(key);
  }

  async sweep(now: Date): Promise<number> {
    let n = 0;
    for (const [k, v] of this.rows) {
      if (v.expiresAt < now && (!v.lockedUntil || v.lockedUntil < now)) {
        this.rows.delete(k);
        n++;
      }
    }
    return n;
  }

  /** Test helper. */
  reset(): void {
    this.rows.clear();
  }
}
