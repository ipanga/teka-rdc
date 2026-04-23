import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

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
}
