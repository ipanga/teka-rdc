import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CitiesService {
  private readonly logger = new Logger(CitiesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Returns only active cities (for buyer city selection).
   */
  async getActiveCities() {
    return this.prisma.city.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { communes: true } },
      },
    });
  }

  /**
   * Returns all cities including inactive (for admin).
   */
  async getAllCities() {
    return this.prisma.city.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { communes: true, products: true } },
      },
    });
  }

  /**
   * Returns communes for a city.
   */
  async getCommunesByCityId(cityId: string) {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) {
      throw new NotFoundException('Ville non trouvée');
    }

    return this.prisma.commune.findMany({
      where: { cityId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Admin: create a city.
   */
  async createCity(data: { name: { fr: string; en?: string }; province: string; isActive?: boolean; sortOrder?: number }) {
    const city = await this.prisma.city.create({
      data: {
        name: data.name as any,
        province: data.province,
        isActive: data.isActive ?? false,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    this.logger.log(`City created: ${city.id}`);
    return city;
  }

  /**
   * Admin: update a city (enable/disable, rename).
   */
  async updateCity(id: string, data: { name?: { fr: string; en?: string }; province?: string; isActive?: boolean; sortOrder?: number }) {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) {
      throw new NotFoundException('Ville non trouvée');
    }

    const updated = await this.prisma.city.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name as any }),
        ...(data.province !== undefined && { province: data.province }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
    });
    this.logger.log(`City updated: ${id} (isActive: ${updated.isActive})`);
    return updated;
  }

  /**
   * Admin: add a commune to a city.
   */
  async createCommune(cityId: string, data: { name: { fr: string; en?: string }; sortOrder?: number }) {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) {
      throw new NotFoundException('Ville non trouvée');
    }

    const commune = await this.prisma.commune.create({
      data: {
        cityId,
        name: data.name as any,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    this.logger.log(`Commune created: ${commune.id} in city ${cityId}`);
    return commune;
  }

  /**
   * Admin: update a commune.
   */
  async updateCommune(id: string, data: { name?: { fr: string; en?: string }; sortOrder?: number }) {
    const commune = await this.prisma.commune.findUnique({ where: { id } });
    if (!commune) {
      throw new NotFoundException('Commune non trouvée');
    }

    return this.prisma.commune.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name as any }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
    });
  }

  /**
   * Admin: delete a commune.
   */
  async deleteCommune(id: string) {
    const commune = await this.prisma.commune.findUnique({ where: { id } });
    if (!commune) {
      throw new NotFoundException('Commune non trouvée');
    }

    await this.prisma.commune.delete({ where: { id } });
    this.logger.log(`Commune deleted: ${id}`);
    return { deleted: true };
  }
}
