import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1/health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {}

  @Get()
  @Public()
  @SkipThrottle()
  async check() {
    let dbStatus: 'ok' | 'error' = 'ok';
    let redisStatus: 'ok' | 'error' = 'ok';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    try {
      await this.redisService.getClient().ping();
    } catch {
      redisStatus = 'error';
    }

    const allOk = dbStatus === 'ok' && redisStatus === 'ok';

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'teka-rdc-api',
      checks: {
        database: dbStatus,
        redis: redisStatus,
      },
      uptime: process.uptime(),
    };
  }

  @Get('ready')
  @Public()
  @SkipThrottle()
  async ready() {
    let dbOk = true;
    let redisOk = true;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbOk = false;
    }

    try {
      await this.redisService.getClient().ping();
    } catch {
      redisOk = false;
    }

    if (!dbOk || !redisOk) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: {
          database: dbOk ? 'ok' : 'error',
          redis: redisOk ? 'ok' : 'error',
        },
      });
    }

    return {
      status: 'ready',
      checks: {
        database: 'ok',
        redis: 'ok',
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
