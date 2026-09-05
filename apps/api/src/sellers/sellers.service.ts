import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CitiesService } from '../cities/cities.service';
import { ApplySellerDto } from './dto/apply-seller.dto';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto';

import {
  declaredTypeMatches,
  sniffDocument,
  stripImageMetadata,
} from '../seller-verification/document-validation';

/** Legacy application photo: images only (both clients compress to WebP). */
const APPLICATION_PHOTO_KINDS = new Set(['jpeg', 'png', 'webp']);

@Injectable()
export class SellersService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private cities: CitiesService,
  ) {}

  /**
   * Upload a seller's KYC document (ID/passport/RCCM photo) to the PRIVATE
   * Cloudinary folder and return its public_id. The applicant then submits that
   * id with the application (idDocumentCloudinaryId). Open to BUYER + SELLER —
   * a fresh registration is role SELLER without a profile yet.
   */
  async uploadDocument(
    file: Express.Multer.File,
  ): Promise<{ cloudinaryId: string }> {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException(
        'La taille du document ne doit pas dépasser 5 Mo',
      );
    }
    // Content is checked from the bytes, never from the declared type, and
    // embedded metadata (EXIF/XMP — GPS of a phone photo) is stripped before
    // the private upload (PR 2 hardening, shared with verification documents).
    const sniffed = sniffDocument(file.buffer);
    if (!sniffed || !APPLICATION_PHOTO_KINDS.has(sniffed.kind)) {
      throw new BadRequestException(
        'Format non supporté. Formats acceptés : JPEG, PNG, WebP.',
      );
    }
    if (!declaredTypeMatches(file.mimetype, sniffed)) {
      throw new BadRequestException(
        'Le contenu du fichier ne correspond pas à son format déclaré',
      );
    }
    return this.cloudinary.uploadPrivateImage(
      stripImageMetadata(file.buffer, sniffed.kind),
    );
  }

  /**
   * Location rule shared by application + profile update (D4): a commune is
   * resolved by `CitiesService.resolveCommune` (exists, active, active city,
   * matches the sent city) and the persisted cityId is DERIVED from it, so the
   * pair can never disagree regardless of what the client sent. A city may be
   * chosen without a commune ONLY while it has no active commune library
   * (no authoritative data yet — D2); the day communes are added the commune
   * becomes required with no client change.
   */
  private async resolveLocation(
    cityId: string | null | undefined,
    communeId: string | null | undefined,
  ): Promise<{ cityId: string; communeId: string | null }> {
    if (communeId) {
      const resolved = await this.cities.resolveCommune(
        communeId,
        cityId || null,
      );
      return { cityId: resolved.cityId, communeId: resolved.communeId };
    }
    if (!cityId) {
      throw new BadRequestException('La ville est requise');
    }
    await this.cities.assertActiveCity(cityId);
    if (await this.cities.cityHasActiveCommunes(cityId)) {
      throw new BadRequestException('La commune est requise pour cette ville');
    }
    return { cityId, communeId: null };
  }

  async apply(userId: string, dto: ApplySellerDto) {
    const location = await this.resolveLocation(dto.cityId, dto.communeId);
    const data = {
      ...dto,
      ...location,
      idDocumentUploadedAt: new Date(),
    };

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
      include: {
        city: { select: { id: true, name: true } },
        commune: { select: { id: true, name: true } },
      },
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

    // Location (D4). Empty strings mean "no change" (avoids an invalid empty
    // FK on spread); ids are validated by DB lookup — seeded ids are
    // non-RFC4122 so a UUID validator would wrongly reject them.
    //   - communeId sent  → resolved (exists, active, belongs to the sent city
    //     or, if none was sent, to any active city) and cityId is derived from
    //     it, so a stale commune from another town can never survive.
    //   - cityId sent alone → validated; when it differs from the current town
    //     the current commune is cleared rather than kept inconsistent, and
    //     the new town must have no active commune library (otherwise the
    //     client must send the commune too).
    //   - communeId: null   → clear, allowed only when the town has no
    //     active commune library. Legacy sellers with communeId = NULL stay
    //     editable: nothing here requires a commune unless the town changes
    //     or a commune is sent.
    const { cityId, communeId, ...rest } = dto;
    const locationData: { cityId?: string; communeId?: string | null } = {};

    if (communeId) {
      const resolved = await this.cities.resolveCommune(
        communeId,
        cityId || null,
      );
      locationData.cityId = resolved.cityId;
      locationData.communeId = resolved.communeId;
    } else if (cityId) {
      await this.cities.assertActiveCity(cityId);
      locationData.cityId = cityId;
      const townChanged = cityId !== profile.cityId;
      if (townChanged || communeId === null) {
        if (await this.cities.cityHasActiveCommunes(cityId)) {
          throw new BadRequestException(
            'La commune est requise pour cette ville',
          );
        }
        locationData.communeId = null;
      }
    } else if (communeId === null) {
      if (
        profile.cityId &&
        (await this.cities.cityHasActiveCommunes(profile.cityId))
      ) {
        throw new BadRequestException(
          'La commune est requise pour cette ville',
        );
      }
      locationData.communeId = null;
    }

    return this.prisma.sellerProfile.update({
      where: { userId },
      data: { ...rest, ...locationData },
      include: {
        city: { select: { id: true, name: true } },
        commune: { select: { id: true, name: true } },
      },
    });
  }
}
