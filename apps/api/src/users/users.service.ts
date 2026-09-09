import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { validateImageUpload } from '../common/uploads/image-upload';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { AVATAR_FOLDER, avatarPublicIdFromUrl } from './avatar-asset';
import { Prisma } from '@prisma/client';
import { verifyPassword } from '../auth/utils/password.util';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { EmailService } from '../email/email.service';

/** `marie@example.cd` → `m•••e@example.cd` — recognisable, not disclosable. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  const head = local.slice(0, 1);
  const tail = local.length > 1 ? local.slice(-1) : '';
  return `${head}•••${tail}@${domain}`;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private rateLimit: RateLimitService,
    private audit: AdminAuditService,
    private emailService: EmailService,
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

  /**
   * Update the caller's own profile.
   *
   * Changing `email` changes the LOGIN IDENTITY for sellers and admins, so it
   * requires fresh proof of identity (2026-09-09). Before this it was a bare
   * write: a hijacked session could point the account at an attacker's
   * address, request a password reset there and own the account permanently —
   * the escalation path into the payout destination that S12 now guards.
   *
   * Rules:
   *  - name-only updates, and re-sending the SAME email, need no password;
   *  - a real email change requires the current password, verified against
   *    the stored hash (never logged, stored or returned). A wrong password
   *    answers 403 — not 401, because every Teka client treats a 401 as an
   *    expired session and would refresh and replay — and counts in the same
   *    `login` lock bucket as the login form;
   *  - the write, the `emailVerified` reset and the audit row commit together;
   *  - the PREVIOUS address is notified after commit: it is the only address a
   *    legitimate owner still controls after a takeover;
   *  - a duplicate address answers a French 409 instead of the raw 500 the
   *    unique constraint used to produce, and says no more than that.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const normalisedEmail = dto.email?.trim().toLowerCase();
    const changingEmail =
      normalisedEmail !== undefined && normalisedEmail !== user.email;

    if (changingEmail) {
      if (!dto.password) {
        throw new BadRequestException(
          "Le mot de passe est requis pour modifier l'adresse de connexion.",
        );
      }
      if (!user.passwordHash) {
        // Buyers authenticate by WhatsApp OTP and have no password: they have
        // no login email to change either.
        throw new BadRequestException(
          'Aucun mot de passe défini sur le compte.',
        );
      }
      const loginKey = user.email ?? user.id;
      await this.rateLimit.assertNotBlocked('login', loginKey);
      const ok = await verifyPassword(dto.password, user.passwordHash);
      if (!ok) {
        await this.rateLimit.enforce('login', loginKey);
        throw new ForbiddenException('Mot de passe invalide.');
      }
    }

    let updated;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.user.update({
          where: { id: userId },
          data: {
            ...(dto.firstName !== undefined && { firstName: dto.firstName }),
            ...(dto.lastName !== undefined && { lastName: dto.lastName }),
            ...(changingEmail && {
              email: normalisedEmail,
              emailVerified: false,
            }),
          },
        });
        if (changingEmail) {
          await this.audit.record(tx, {
            actorId: userId,
            action: 'LOGIN_EMAIL_CHANGED',
            entityType: 'user',
            entityId: userId,
            before: { email: user.email ? maskEmail(user.email) : null },
            after: { email: maskEmail(normalisedEmail!), emailVerified: false },
            reason: null,
          });
        }
        return row;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Says only that it cannot be used — never whether it belongs to
        // someone else, which would be an account-existence oracle.
        throw new ConflictException(
          "Cette adresse email ne peut pas être utilisée.",
        );
      }
      throw err;
    }

    if (changingEmail && user.email) {
      const previous = user.email;
      const changedLabel = new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Africa/Lubumbashi',
      }).format(new Date());
      this.emailService
        .sendLoginEmailChanged(
          previous,
          updated.firstName,
          maskEmail(normalisedEmail!),
          changedLabel,
        )
        .catch((e) =>
          this.logger.warn(
            `login-email-change notice failed for ${userId}: ${e?.message ?? e}`,
          ),
        );
      this.logger.log(`Login email changed for user ${userId}`);
    }

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
