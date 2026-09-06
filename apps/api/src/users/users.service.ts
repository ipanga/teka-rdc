import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { validateImageUpload } from '../common/uploads/image-upload';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { AVATAR_FOLDER, avatarPublicIdFromUrl } from './avatar-asset';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

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
      },
    });

    const { passwordHash, deletedAt, ...profile } = updated;
    return profile;
  }

  /**
   * Replace the user's avatar (D11, 2026-09-06).
   *
   * Order of operations — validate → upload the new asset → persist the row →
   * destroy the previous asset → (CDN invalidated by the destroy):
   *  * the row only ever points at an asset that exists — the new one is on
   *    Cloudinary before the URL is written, and the old one is destroyed only
   *    after the write succeeded;
   *  * if persisting fails, the just-uploaded asset is removed (best effort) so
   *    the failure leaves no orphan, and the error is surfaced — the profile
   *    still shows the previous avatar;
   *  * a failure to destroy the previous asset is logged and swallowed: the
   *    profile is already correct, an orphan is a cost, not a corruption.
   *
   * The previous asset's public id is derived from the stored URL with the
   * strict {@link avatarPublicIdFromUrl}: only an avatar this API uploaded to
   * `teka-rdc/avatars` for this user is ever destroyed — never a product image,
   * a document or any URL a client could have stored by hand.
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
      select: { id: true, avatar: true },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const upload = await this.cloudinary.uploadImage(image.buffer, AVATAR_FOLDER);

    let updated: { id: string; avatar: string | null };
    try {
      updated = await this.prisma.user.update({
        where: { id: userId },
        data: { avatar: upload.url },
        select: { id: true, avatar: true },
      });
    } catch (error) {
      // The row still holds the previous avatar; do not leave the new asset
      // behind. deleteImage never throws.
      await this.cloudinary.deleteImage(upload.cloudinaryId, { invalidate: true });
      throw error;
    }

    const previousId = avatarPublicIdFromUrl(user.avatar, this.cloudinary.cloudName);
    if (previousId && previousId !== upload.cloudinaryId) {
      // Never throws (logged inside); the profile is already correct.
      await this.cloudinary.deleteImage(previousId, { invalidate: true });
    } else if (user.avatar && !previousId) {
      this.logger.warn(
        `Avatar replaced for user ${userId}; previous value was not an avatar asset of this API and was left untouched`,
      );
    }

    return { avatar: updated.avatar };
  }
}
