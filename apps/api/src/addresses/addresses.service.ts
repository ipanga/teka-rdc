import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateAddressDto) {
    // If setting as default, unset existing default
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
    }

    return this.prisma.address.create({
      data: { ...dto, userId },
    });
  }

  async update(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto & { isDefault?: boolean },
  ) {
    const address = await this.findOneOrFail(userId, addressId);

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
      data: dto,
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

    const result: Record<string, { id: string; name: unknown }[]> = {};
    for (const city of cities) {
      if (!result[city.province]) {
        result[city.province] = [];
      }
      result[city.province].push({ id: city.id, name: city.name });
    }
    return result;
  }

  async getNeighborhoods(town: string) {
    // Try to find city by French name and return its communes
    const city = await this.prisma.city.findFirst({
      where: {
        isActive: true,
        OR: [
          { name: { path: ['fr'], equals: town } },
          { name: { path: ['en'], equals: town } },
        ],
      },
    });

    if (!city) return [];

    const communes = await this.prisma.commune.findMany({
      where: { cityId: city.id },
      orderBy: { sortOrder: 'asc' },
    });

    return communes.map((c) => {
      const name = c.name as { fr: string; en?: string };
      return name.fr;
    });
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
