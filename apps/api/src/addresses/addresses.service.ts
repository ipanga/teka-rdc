import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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

  async update(userId: string, addressId: string, dto: UpdateAddressDto & { isDefault?: boolean }) {
    const address = await this.findOneOrFail(userId, addressId);

    // If setting as default, unset existing default
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true, deletedAt: null, id: { not: addressId } },
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
    return {
      'Haut-Katanga': ['Lubumbashi', 'Likasi', 'Kipushi', 'Kasumbalesa', 'Kambove'],
      'Lualaba': ['Kolwezi', 'Dilolo', 'Fungurume'],
    };
  }

  async getNeighborhoods(town: string) {
    const neighborhoods: Record<string, string[]> = {
      'Lubumbashi': ['Lubumbashi', 'Kampemba', 'Kamalondo', 'Kenya', 'Katuba', 'Rwashi', 'Annexe'],
      'Likasi': ['Likasi', 'Panda', 'Kikula'],
      'Kolwezi': ['Kolwezi', 'Dilala', 'Manika'],
    };
    return neighborhoods[town] || [];
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
