import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { validateImageUpload } from '../common/uploads/image-upload';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      include: { sellerProfile: true, preferredCity: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const { passwordHash, deletedAt, ...profile } = user;
    return profile;
  }

  /**
   * Set (or clear) the authenticated user's preferred delivery town
   * (Town Architecture Refactor). Passing `cityId: null` clears it. A non-null
   * city must exist and be active. Returns `{ preferredCityId }` so the client
   * can reconcile its local town state.
   */
  async setPreferredCity(userId: string, cityId: string | null) {
    if (cityId) {
      const city = await this.prisma.city.findFirst({
        where: { id: cityId, isActive: true },
        select: { id: true },
      });
      if (!city) {
        throw new BadRequestException('Ville invalide ou inactive');
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { preferredCityId: cityId },
    });

    return { preferredCityId: cityId };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.email !== undefined && {
          email: dto.email,
          emailVerified: false,
        }),
        ...(dto.avatar !== undefined && { avatar: dto.avatar }),
      },
    });

    const { passwordHash, deletedAt, ...profile } = updated;
    return profile;
  }

  /**
   * Upload a new avatar to Cloudinary and save the URL on the user row.
   * Returns the updated avatar URL. The image is stored under the
   * `teka-rdc/avatars` folder so it's queryable separately from products
   * for any future bulk-cleanup work.
   */
  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu');
    }
    // Size / content / metadata hardening shared with product images (S8):
    // multer refused anything above 5 MB while streaming; the bytes must
    // sniff as JPEG/PNG/WebP (SVG and friends can never pass), agree with the
    // declared type, and lose their EXIF/XMP (GPS) before the public upload.
    const image = validateImageUpload(file, {
      allowGif: false,
      unsupportedMessage: 'Format invalide — image attendue (jpg, png, webp)',
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const upload = await this.cloudinary.uploadImage(
      image.buffer,
      'teka-rdc/avatars',
    );

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: upload.url },
      select: { id: true, avatar: true },
    });

    return { avatar: updated.avatar };
  }
}
