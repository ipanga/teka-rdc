import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Keys that are exposed to public (unauthenticated) requests */
const PUBLIC_SETTING_KEYS = ['MAINTENANCE_MODE', 'PLATFORM_ANNOUNCEMENT'];

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private prisma: PrismaService,
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
   * Get a single setting by key.
   */
  async getSetting(key: string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundException(`Paramètre "${key}" non trouvé`);
    }

    return setting;
  }

  /**
   * Update a setting by key.
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

    return setting;
  }

  /**
   * Get only public-facing settings (MAINTENANCE_MODE, PLATFORM_ANNOUNCEMENT).
   */
  async getPublicSettings() {
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

    return settingsMap;
  }
}
