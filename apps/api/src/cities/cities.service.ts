import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';

/** Result of resolving a commune chosen by a client (see `resolveCommune`). */
export interface ResolvedCommune {
  communeId: string;
  cityId: string;
  communeName: string;
}

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
   * Returns the communes of a city. Public pickers (buyer address, seller
   * profile/application) get only the ACTIVE ones; the admin CRUD passes
   * `includeInactive` to manage retired communes too.
   */
  async getCommunesByCityId(
    cityId: string,
    opts: { includeInactive?: boolean } = {},
  ) {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) {
      throw new NotFoundException('Ville non trouvée');
    }

    return this.prisma.commune.findMany({
      where: { cityId, ...(opts.includeInactive ? {} : { isActive: true }) },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Does this city have an authoritative commune library the clients must
   * pick from? Cities without communes (no reliable data yet — D2) let a
   * seller apply with the city alone; the commune becomes required the day
   * the library is added, with no client change.
   */
  async cityHasActiveCommunes(cityId: string): Promise<boolean> {
    const count = await this.prisma.commune.count({
      where: { cityId, isActive: true },
    });
    return count > 0;
  }

  /**
   * Single source of truth for "a client picked commune X (in city Y)".
   * Rejects a commune that does not exist, is inactive, belongs to an
   * inactive city, or does not belong to `expectedCityId` when the client
   * sent one. Returns the commune's own cityId so callers persist the pair
   * from one authority and city + commune can never disagree (D4).
   *
   * Seeded ids are non-RFC4122, so validation is a DB lookup, never @IsUUID.
   */
  async resolveCommune(
    communeId: string,
    expectedCityId?: string | null,
  ): Promise<ResolvedCommune> {
    const commune = await this.prisma.commune.findUnique({
      where: { id: communeId },
      select: {
        id: true,
        name: true,
        cityId: true,
        isActive: true,
        city: { select: { isActive: true } },
      },
    });
    if (!commune) {
      throw new BadRequestException('Commune invalide');
    }
    if (!commune.isActive || !commune.city?.isActive) {
      throw new BadRequestException('Commune inactive');
    }
    if (expectedCityId && expectedCityId !== commune.cityId) {
      throw new BadRequestException(
        'La commune ne correspond pas à la ville sélectionnée',
      );
    }
    return {
      communeId: commune.id,
      cityId: commune.cityId,
      communeName: commune.name,
    };
  }

  /** Active city or 400 — the seller-side counterpart of `resolveCommune`. */
  async assertActiveCity(cityId: string): Promise<void> {
    const city = await this.prisma.city.findFirst({
      where: { id: cityId, isActive: true },
      select: { id: true },
    });
    if (!city) {
      throw new BadRequestException('Ville invalide ou inactive');
    }
  }

  /**
   * Admin: create a city.
   */
  async createCity(data: {
    name: string;
    province: string;
    isActive?: boolean;
    sortOrder?: number;
    accentColor?: string;
    heroImageUrl?: string;
  }) {
    const city = await this.prisma.city.create({
      data: {
        name: data.name,
        // URL `{ville}` segment. Generated from the name so future cities work
        // with no extra steps (e.g. "Likasi" -> "likasi").
        slug: slugify(data.name),
        province: data.province,
        isActive: data.isActive ?? false,
        sortOrder: data.sortOrder ?? 0,
        accentColor: data.accentColor ?? null,
        heroImageUrl: data.heroImageUrl ?? null,
      },
    });
    this.logger.log(`City created: ${city.id}`);
    return city;
  }

  /**
   * Admin: update a city (enable/disable, rename).
   */
  async updateCity(
    id: string,
    data: {
      name?: string;
      province?: string;
      isActive?: boolean;
      sortOrder?: number;
      accentColor?: string;
      heroImageUrl?: string;
    },
  ) {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) {
      throw new NotFoundException('Ville non trouvée');
    }

    const updated = await this.prisma.city.update({
      where: { id },
      data: {
        // Keep the URL slug in lockstep with renames. Note: changing a city's
        // slug changes its public URLs — acceptable for the rare admin rename.
        ...(data.name !== undefined && {
          name: data.name,
          slug: slugify(data.name),
        }),
        ...(data.province !== undefined && { province: data.province }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.accentColor !== undefined && { accentColor: data.accentColor }),
        ...(data.heroImageUrl !== undefined && {
          heroImageUrl: data.heroImageUrl,
        }),
      },
    });
    this.logger.log(`City updated: ${id} (isActive: ${updated.isActive})`);
    return updated;
  }

  /**
   * Admin: add a commune to a city.
   */
  async createCommune(
    cityId: string,
    data: { name: string; sortOrder?: number; isActive?: boolean },
  ) {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) {
      throw new NotFoundException('Ville non trouvée');
    }

    const commune = await this.prisma.commune.create({
      data: {
        cityId,
        name: data.name,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
    this.logger.log(`Commune created: ${commune.id} in city ${cityId}`);
    return commune;
  }

  /**
   * Admin: update a commune.
   */
  async updateCommune(
    id: string,
    data: { name?: string; sortOrder?: number; isActive?: boolean },
  ) {
    const commune = await this.prisma.commune.findUnique({ where: { id } });
    if (!commune) {
      throw new NotFoundException('Commune non trouvée');
    }

    const updated = await this.prisma.commune.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
    if (data.isActive !== undefined) {
      this.logger.log(`Commune ${id} isActive → ${updated.isActive}`);
    }
    return updated;
  }

  /**
   * Admin: delete a commune. Refused (409) while sellers or addresses still
   * point at it — the FK is ON DELETE SET NULL and would silently erase their
   * location; deactivate instead (`isActive: false`).
   */
  async deleteCommune(id: string) {
    const commune = await this.prisma.commune.findUnique({
      where: { id },
      select: {
        id: true,
        _count: { select: { sellerProfiles: true, addresses: true } },
      },
    });
    if (!commune) {
      throw new NotFoundException('Commune non trouvée');
    }
    const refs = commune._count.sellerProfiles + commune._count.addresses;
    if (refs > 0) {
      throw new ConflictException(
        `Commune utilisée par ${refs} vendeur(s) ou adresse(s) — désactivez-la plutôt`,
      );
    }

    await this.prisma.commune.delete({ where: { id } });
    this.logger.log(`Commune deleted: ${id}`);
    return { deleted: true };
  }
}
