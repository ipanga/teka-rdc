import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetMocks, mockRedisService, mockPrismaService } from './test-utils';

describe('Health Check (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMocks();
  });

  describe('GET /api/v1/health', () => {
    it('should return ok status when all dependencies are healthy', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.service).toBe('teka-rdc-api');
          expect(res.body.timestamp).toBeDefined();
          expect(res.body.checks.database).toBe('ok');
          expect(res.body.checks.redis).toBe('ok');
          expect(res.body.uptime).toBeDefined();
        });
    });

    it('should return degraded status when database is down', () => {
      mockPrismaService.$queryRaw.mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      return request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('degraded');
          expect(res.body.checks.database).toBe('error');
          expect(res.body.checks.redis).toBe('ok');
        });
    });

    it('should return degraded status when Redis is down', () => {
      mockRedisService.getClient.mockReturnValueOnce({
        ping: jest.fn().mockRejectedValueOnce(new Error('Connection refused')),
      });

      return request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('degraded');
          expect(res.body.checks.database).toBe('ok');
          expect(res.body.checks.redis).toBe('error');
        });
    });
  });

  describe('GET /api/v1/health/live', () => {
    it('should return alive status', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200)
        .expect((res) => {
          // ResponseInterceptor wraps it: { success: true, data: { status: 'alive' } }
          expect(res.body.success).toBe(true);
          expect(res.body.data.status).toBe('alive');
        });
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('should return ready when all dependencies are healthy', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.status).toBe('ready');
          expect(res.body.data.checks.database).toBe('ok');
          expect(res.body.data.checks.redis).toBe('ok');
        });
    });

    it('should return 503 when database is down', () => {
      mockPrismaService.$queryRaw.mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      return request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(503);
    });

    it('should return 503 when Redis is down', () => {
      mockRedisService.getClient.mockReturnValueOnce({
        ping: jest.fn().mockRejectedValueOnce(new Error('Connection refused')),
      });

      return request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(503);
    });
  });
});
