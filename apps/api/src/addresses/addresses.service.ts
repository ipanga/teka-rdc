import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CitiesService } from '../cities/cities.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(
    private prisma: PrismaService,
    private cities: CitiesService,
  ) {}

  /**
   * Server-side truth for the Ville → Commune pair on a buyer address (the
   * dropdown filtering in buyer-web / buyer-mobile is a convenience, not the
   * rule). Same authority as sellers: `CitiesService.resolveCommune` refuses a
   * commune that does not exist, is retired, sits in an inactive city, or does
   * not belong to the city the client sent; `assertActiveCity` covers a city
   * without commune. Returns the pair to persist — the city always comes from
   * the commune when one is given, so the two can never disagree.
   *
   * `previous` is the stored row on PATCH: fields the client omits keep their
   * value, a city change without a new commune drops the old commune (it
   * belongs to another city), and an untouched pair is not re-validated — an
   * address whose commune was retired later stays readable and editable
   * (label, phone…) as long as the client does not re-select that commune.
   */
  private async resolveLocation(
    dto: { cityId?: string | null; communeId?: string | null },
    previous?: { cityId: string | null; communeId: string | null },
  ): Promise<{ cityId: string | null; communeId: string | null }> {
    const cityTouched = dto.cityId !== undefined;
    const communeTouched = dto.communeId !== undefined;
    if (previous && !cityTouched && !communeTouched) {
      return { cityId: previous.cityId, communeId: previous.communeId };
    }
    const cityId = cityTouched ? (dto.cityId ?? null) : (previous?.cityId ?? null);
    let communeId = communeTouched
      ? (dto.communeId ?? null)
      : (previous?.communeId ?? null);
    if (
      previous &&
      cityTouched &&
      !communeTouched &&
      communeId &&
      cityId !== previous.cityId
    ) {
      // The client moved to another town but did not pick a commune there:
      // the old commune cannot be carried over (it is in the previous town).
      communeId = null;
    }
    if (communeId) {
      const resolved = await this.cities.resolveCommune(communeId, cityId);
      return { cityId: resolved.cityId, communeId: resolved.communeId };
    }
    if (cityId) await this.cities.assertActiveCity(cityId);
    return { cityId, communeId: null };
  }

  async findAll(userId: string) {
    return this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Create-or-update the caller's address.
   *
   * A BUYER holds exactly one current delivery address, enforced here rather
   * than in the clients so the rule cannot be bypassed from the web. POST is
   * therefore an upsert: with an address already on file it updates that row
   * instead of accumulating another. Sellers and admins are deliberately left
   * on the original multi-address behaviour — the single-address rule is a
   * buyer product decision, and capping them would be an unrelated change.
   *
   * Concurrency: the whole thing runs in one transaction that first takes a row
   * lock on the owning user, so two simultaneous POSTs from the same buyer
   * serialize and the second sees the first's address. A partial unique index
   * on addresses("userId") would be the stronger guard, but Postgres cannot
   * scope a partial index by a column on another table, so it would silently
   * cap sellers too.
   *
   * The update is a full replace: optional fields absent from the payload are
   * explicitly nulled, so clearing the landmark actually clears it rather than
   * silently keeping the previous value (Prisma ignores `undefined`).
   */
  async create(userId: string, dto: CreateAddressDto) {
    const location = await this.resolveLocation(dto);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      const fields = {
        label: dto.label ?? null,
        province: dto.province,
        town: dto.town,
        neighborhood: dto.neighborhood,
        cityId: location.cityId,
        communeId: location.communeId,
        avenue: dto.avenue ?? null,
        reference: dto.reference ?? null,
        recipientName: dto.recipientName ?? null,
        recipientPhone: dto.recipientPhone ?? null,
      };

      if (user?.role === 'BUYER') {
        // Legacy buyers may still hold more than one active row (they are
        // archived by a separate, reported migration — never silently here).
        // Prefer the default, else the most recent: the same row findAll and
        // checkout already treat as current.
        const current = await tx.address.findFirst({
          where: { userId, deletedAt: null },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        });

        if (current) {
          return tx.address.update({
            where: { id: current.id },
            data: { ...fields, isDefault: true },
          });
        }

        return tx.address.create({
          data: { ...fields, userId, isDefault: true },
        });
      }

      if (dto.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, deletedAt: null },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: { ...fields, userId, isDefault: dto.isDefault ?? false },
      });
    });
  }

  async update(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto & { isDefault?: boolean },
  ) {
    const address = await this.findOneOrFail(userId, addressId);
    const location = await this.resolveLocation(dto, {
      cityId: address.cityId,
      communeId: address.communeId,
    });

    // If setting as default, unset existing default
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: {
          userId,
          isDefault: true,
          deletedAt: null,
          id: { not: addressId },
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.address.update({
      where: { id: address.id },
      data: { ...dto, ...location },
    });
  }

  async remove(userId: string, addressId: string) {
    const address = await this.findOneOrFail(userId, addressId);

    await this.prisma.address.update({
      where: { id: address.id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Adresse supprimée' };
  }

  async setDefault(userId: string, addressId: string) {
    const address = await this.findOneOrFail(userId, addressId);

    await this.prisma.$transaction([
      this.prisma.address.updateMany({
        where: { userId, isDefault: true, deletedAt: null },
        data: { isDefault: false },
      }),
      this.prisma.address.update({
        where: { id: address.id },
        data: { isDefault: true },
      }),
    ]);

    return this.prisma.address.findUnique({ where: { id: address.id } });
  }

  async getTowns() {
    // Return cities grouped by province from the database
    const cities = await this.prisma.city.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const result: Record<string, { id: string; name: string }[]> = {};
    for (const city of cities) {
      if (!result[city.province]) {
        result[city.province] = [];
      }
      result[city.province].push({ id: city.id, name: city.name });
    }
    return result;
  }

  async getNeighborhoods(town: string) {
    // Find city by name (plain string after the FR-only refactor) and return
    // its communes' names.
    const city = await this.prisma.city.findFirst({
      where: { isActive: true, name: town },
    });

    if (!city) return [];

    // Retired communes are not offered for new addresses (same rule as
    // GET /v1/cities/:id/communes).
    const communes = await this.prisma.commune.findMany({
      where: { cityId: city.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return communes.map((c) => c.name);
  }

  private async findOneOrFail(userId: string, addressId: string) {
    const address = await this.prisma.address.findUnique({
      where: { id: addressId, deletedAt: null },
    });

    if (!address) {
      throw new NotFoundException('Adresse non trouvée');
    }

    if (address.userId !== userId) {
      throw new ForbiddenException('Accès non autorisé');
    }

    return address;
  }
}
