import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Append Prisma pool-tuning params to the connection string.
 *
 * Prisma's default pool is `num_cpus * 2 + 1` — only **5** on the 2-CPU prod
 * box. Under a brief DB slowdown (shared host) or a few long transactions, all
 * 5 connections get held and even trivial reads (`/cities`, `/browse/categories`)
 * fail with "Timed out fetching a new connection from the connection pool".
 *
 * We raise `connection_limit` and `pool_timeout`, both overridable via env so
 * ops can tune to the DB's `max_connections` without a code change. NOTE: we
 * append as a raw string rather than using `new URL()` — the prod password
 * contains an unencoded `@`, which `URL` would mis-parse and corrupt the DSN.
 */
function withPoolParams(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  // Defaults tuned to the measured prod DB (2026-07-06): shared alwaysdata
  // cluster, max_connections=500 (only ~3 ours), ~8 worker processes. Best
  // practice sizes the pool to the DB's *throughput optimum* (~cores×2 ≈ 16),
  // NOT the ceiling — a bigger pool just queues inside Postgres. 20 gives that
  // optimum + burst headroom while staying a trivial 20/500 slice (good-neighbor
  // on a shared cluster). One API instance → one pool. Tune via env if traffic
  // grows or instances are added (keep Σ pools well under 500 − reserved).
  const params: Record<string, string> = {
    connection_limit: process.env.DATABASE_CONNECTION_LIMIT ?? '20',
    pool_timeout: process.env.DATABASE_POOL_TIMEOUT ?? '20',
  };
  let url = raw;
  for (const [key, value] of Object.entries(params)) {
    if (new RegExp(`[?&]${key}=`).test(url)) continue; // respect an explicit override in the DSN
    url += (url.includes('?') ? '&' : '?') + `${key}=${value}`;
  }
  return url;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      datasourceUrl: withPoolParams(process.env.DATABASE_URL),
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to database');
    } catch (error) {
      this.logger.error(
        'Failed to connect to database. API will start but DB operations will fail.',
        error instanceof Error ? error.message : error,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
