import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApplySellerDto } from './dto/apply-seller.dto';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto';

@Injectable()
export class SellersService {
  constructor(private prisma: PrismaService) {}

  async apply(userId: string, dto: ApplySellerDto) {
    // The commune is the source of truth for location: derive cityId from it
    // so city + commune can never disagree, regardless of what the client sent.
    const commune = await this.prisma.commune.findUnique({
      where: { id: dto.communeId },
    });
    if (!commune) {
      throw new BadRequestException('Commune invalide');
    }
    // cityId from the client (if any) is overwritten by the commune's city.
    const data = { ...dto, cityId: commune.cityId };

    // Check if user already has a seller application
    const existing = await this.prisma.sellerProfile.findUnique({
      where: { userId },
    });

    if (existing) {
      if (existing.applicationStatus === 'PENDING') {
        throw new ConflictException('Vous avez déjà une demande en cours');
      }
      if (existing.applicationStatus === 'APPROVED') {
        throw new ConflictException('Vous êtes déjà vendeur');
      }
      // If rejected, allow reapplication by updating existing record
      return this.prisma.sellerProfile.update({
        where: { userId },
        data: {
          ...data,
          applicationStatus: 'PENDING',
          rejectionReason: null,
          approvedAt: null,
          approvedById: null,
        },
      });
    }

    return this.prisma.sellerProfile.create({
      data: { ...data, userId },
    });
  }

  async getApplication(userId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      include: {
        city: { select: { id: true, name: true } },
        commune: { select: { id: true, name: true } },
      },
    });

    if (!profile) {
      return { hasApplication: false };
    }

    return { hasApplication: true, ...profile };
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId, deletedAt: null },
    });

    if (!profile) {
      throw new NotFoundException('Profil vendeur non trouvé');
    }

    return profile;
  }

  async updateProfile(userId: string, dto: UpdateSellerProfileDto) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId, deletedAt: null },
    });

    if (!profile) {
      throw new NotFoundException('Profil vendeur non trouvé');
    }

    if (profile.applicationStatus !== 'APPROVED') {
      throw new ForbiddenException(
        "Votre profil vendeur n'est pas encore approuvé",
      );
    }

    return this.prisma.sellerProfile.update({
      where: { userId },
      data: dto,
    });
  }
}
