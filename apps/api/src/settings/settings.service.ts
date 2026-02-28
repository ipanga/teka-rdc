import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const SETTING_CACHE_TTL = 60; // 1 minute
const PUBLIC_SETTINGS_CACHE_KEY = 'settings:public';

/** Keys that are exposed to public (unauthenticated) requests */
const PUBLIC_SETTING_KEYS = ['MAINTENANCE_MODE', 'PLATFORM_ANNOUNCEMENT'];

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Get all system settings. For admin use only.
   */
  async findAll() {
    const settings = await this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
      include: {
        updatedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return settings;
  }

  /**
   * Get a single setting by key. Cached in Redis for 1 minute.
   */
  async getSetting(key: string) {
    const cacheKey = `settings:${key}`;

    // Try cache first
    try {
      const cached = await this.redis.getJson(cacheKey);
      if (cached) {
        this.logger.debug(`Returning cached setting: ${key}`);
        return cached;
      }
    } catch (err) {
      this.logger.warn('Redis cache read failed for setting', err);
    }

    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundException(`Paramètre "${key}" non trouvé`);
    }

    // Cache result
    try {
      await this.redis.setJson(cacheKey, setting, SETTING_CACHE_TTL);
    } catch (err) {
      this.logger.warn('Redis cache write failed for setting', err);
    }

    return setting;
  }

  /**
   * Update a setting by key. Invalidates the Redis cache.
   */
  async updateSetting(key: string, value: string, userId: string) {
    // Verify setting exists
    const existing = await this.prisma.systemSetting.findUnique({
      where: { key },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Paramètre "${key}" non trouvé`);
    }

    const setting = await this.prisma.systemSetting.update({
      where: { key },
      data: {
        value,
        updatedById: userId,
      },
    });

    this.logger.log(`Setting "${key}" updated by user ${userId}`);

    // Invalidate caches
    try {
      await this.redis.del(`settings:${key}`);
      // Also invalidate public settings cache if this is a public key
      if (PUBLIC_SETTING_KEYS.includes(key)) {
        await this.redis.del(PUBLIC_SETTINGS_CACHE_KEY);
      }
    } catch (err) {
      this.logger.warn('Redis cache invalidation failed for setting', err);
    }

    return setting;
  }

  /**
   * Get only public-facing settings (MAINTENANCE_MODE, PLATFORM_ANNOUNCEMENT).
   * Cached in Redis for 1 minute.
   */
  async getPublicSettings() {
    // Try cache first
    try {
      const cached = await this.redis.getJson(PUBLIC_SETTINGS_CACHE_KEY);
      if (cached) {
        this.logger.debug('Returning cached public settings');
        return cached;
      }
    } catch (err) {
      this.logger.warn('Redis cache read failed for public settings', err);
    }

    const settings = await this.prisma.systemSetting.findMany({
      where: {
        key: { in: PUBLIC_SETTING_KEYS },
      },
      select: {
        key: true,
        value: true,
        type: true,
        label: true,
      },
    });

    // Transform into a key-value map for easier frontend consumption
    const settingsMap: Record<string, { value: string; type: string; label: unknown }> = {};
    for (const setting of settings) {
      settingsMap[setting.key] = {
        value: setting.value,
        type: setting.type,
        label: setting.label,
      };
    }

    // Cache result
    try {
      await this.redis.setJson(
        PUBLIC_SETTINGS_CACHE_KEY,
        settingsMap,
        SETTING_CACHE_TTL,
      );
    } catch (err) {
      this.logger.warn('Redis cache write failed for public settings', err);
    }

    return settingsMap;
  }
}
