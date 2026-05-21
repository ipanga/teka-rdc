import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Public()
  @SkipThrottle()
  async check() {
    let dbStatus: 'ok' | 'error' = 'ok';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'teka-rdc-api',
      checks: {
        database: dbStatus,
      },
      uptime: process.uptime(),
    };
  }

  @Get('ready')
  @Public()
  @SkipThrottle()
  async ready() {
    let dbOk = true;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbOk = false;
    }

    if (!dbOk) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: {
          database: 'error',
        },
      });
    }

    return {
      status: 'ready',
      checks: {
        database: 'ok',
      },
    };
  }

  @Get('live')
  @Public()
  @SkipThrottle()
  live() {
    return { status: 'alive' };
  }

  /**
   * One-shot Sentry verification endpoint. Throws a deterministic error
   * so an operator can confirm the Sentry pipeline is wired end-to-end
   * after `SENTRY_DSN` is set on the VPS.
   *
   * Admin-only (`@Roles('ADMIN')`) — exposing this anonymously would let
   * anyone spam Sentry quota. Throttling is left on (no `@SkipThrottle`)
   * for the same reason: even an admin can't accidentally trigger an
   * event storm. Single GET → single 500 → single Sentry event.
   *
   * Expected response: HTTP 500 with the standard error envelope. The
   * actual signal is in Sentry — open the project's Issues view and
   * look for an event tagged `kind: unhandled` with the message below
   * within ~30s of hitting this endpoint.
   */
  @Get('sentry-test')
  @Roles('ADMIN')
  sentryTest(): never {
    // Throwing a raw `Error` (not an HttpException) routes through the
    // "unhandled exception" branch of HttpExceptionFilter — the same path
    // most real prod 500s take. Sentry receives the event tagged
    // `{ method: 'GET', kind: 'unhandled' }`.
    throw new Error(
      'Intentional Sentry verification error — safe to dismiss in alerts.',
    );
  }
}
