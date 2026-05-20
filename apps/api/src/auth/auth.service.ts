import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { EmailLoginDto } from './dto/email-login.dto';
import { EmailRegisterDto } from './dto/email-register.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { PasswordChangeDto } from './dto/password-change.dto';
import {
  generateResetToken,
  hashPassword,
  hashResetToken,
  verifyPassword,
} from './utils/password.util';

type AssignableRole = 'SELLER';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  // ---------------------------------------------------------------------------
  // Email + password — seller registration, login (sellers + admins), and
  // password reset (sellers + admins).
  //
  // Buyers authenticate via WhatsApp OTP since 2026-05-15 — see
  // BuyerOtpService + BuyerClaimService. Admins are seeded out-of-band and
  // bootstrap their first password via /password-reset/request.
  // ---------------------------------------------------------------------------

  async registerSellerWithEmail(dto: EmailRegisterDto) {
    return this.registerWithEmailForRole(dto, 'SELLER');
  }

  private async registerWithEmailForRole(
    dto: EmailRegisterDto,
    role: AssignableRole,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Un compte avec cet email existe déjà');
    }

    const rounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await hashPassword(dto.password, rounds);

    const user = await this.prisma.user.create({
      data: {
        // phone is now nullable; email-registered users have none on file
        // until they add one explicitly via the profile / address screens.
        phone: null,
        email: dto.email,
        passwordHash,
        passwordSetAt: new Date(),
        firstName: dto.firstName,
        lastName: dto.lastName,
        role,
        status: 'ACTIVE',
        authProvider: 'EMAIL_PASSWORD',
        emailVerified: false,
      },
    });

    // Fire-and-forget verification email. Failure doesn't block registration —
    // soft verification model: user is logged in, can resend later.
    this.sendEmailVerification(user.id).catch((error) => {
      this.logger.warn(
        `Failed to send verification email for ${user.id}: ${error instanceof Error ? error.message : error}`,
      );
    });

    const tokens = await this.generateTokens(user.id, user.role, user.phone);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { user: this.sanitizeUser(user), tokens };
  }

  async loginWithEmail(dto: EmailLoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });

    // Constant-time fail to avoid user enumeration
    if (!user || !user.passwordHash) {
      await verifyPassword(
        dto.password,
        '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv',
      );
      throw new UnauthorizedException('Email ou mot de passe invalide');
    }

    const ok = await verifyPassword(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Email ou mot de passe invalide');
    }

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new ForbiddenException('Votre compte a été suspendu.');
    }

    const tokens = await this.generateTokens(user.id, user.role, user.phone);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { user: this.sanitizeUser(user), tokens };
  }

  // Seller migration (phone-OTP legacy seller → email + password) was
  // retired on 2026-05-18. The platform seller (the only seller that
  // ever existed) was data-migrated directly to email + password; no
  // live caller of these endpoints remains. The SellerMigration table
  // stays in the schema for historical rows but is no longer written to.

  // ---------------------------------------------------------------------------
  // Password reset (shared across all email-based roles: BUYER, SELLER, ADMIN).
  // ---------------------------------------------------------------------------

  async requestPasswordReset(dto: PasswordResetRequestDto, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });

    // Always respond 200 regardless of existence (avoid enumeration). Email
    // password reset only applies to sellers + admins since 2026-05-15;
    // buyers authenticate via WhatsApp OTP and have no password to reset.
    // A legacy email+password buyer from the 2026-05-12..05-15 window who
    // attempts password reset gets a neutral 200 — they're redirected to
    // /reclamer-compte (the claim flow) instead.
    //
    // Don't gate on `user.passwordHash`: the very first admin login goes
    // through forgot-password *because* they don't have a password yet.
    if (user && (user.role === 'ADMIN' || user.role === 'SELLER')) {
      const expiryMinutes = this.configService.get<number>(
        'PASSWORD_RESET_EXPIRY_MINUTES',
        60,
      );
      const { raw, hash } = generateResetToken();
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + expiryMinutes * 60_000),
          ipAddress,
        },
      });

      const baseUrl = this.resolveWebUrlForRole(user.role);
      const resetUrl = `${baseUrl}/reset-password?token=${raw}`;
      await this.emailService.sendPasswordResetEmail(user.email!, resetUrl);
    } else {
      this.logger.log(
        `Password reset requested for unknown email: ${dto.email}`,
      );
    }

    return {
      message:
        'Si un compte existe, un email de réinitialisation a été envoyé.',
    };
  }

  async confirmPasswordReset(dto: PasswordResetConfirmDto) {
    const tokenHash = hashResetToken(dto.token);
    const record = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!record) {
      throw new BadRequestException(
        'Lien de réinitialisation invalide ou expiré',
      );
    }

    const rounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await hashPassword(dto.newPassword, rounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          passwordSetAt: new Date(),
          // Reaching this code path proves the user controls the email (only
          // they could have followed the reset link), so flip emailVerified
          // atomically. Documented in docs/deployment.md § 5b.
          emailVerified: true,
          // Users who reset may have come from PHONE_OTP; consolidate to EMAIL_PASSWORD.
          authProvider: 'EMAIL_PASSWORD',
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Revoke all existing refresh tokens — forces re-login everywhere.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  /**
   * In-app password change for an authenticated user. Verifies the current
   * password, hashes the new one, and revokes all refresh tokens (forces
   * other devices to re-login). Only allowed for users with a password —
   * buyers (WhatsApp OTP) are rejected with a 400 since there's nothing to
   * change.
   *
   * The current cookie/session continues to work because cookie-based access
   * tokens are stateless JWTs unaffected by the refresh-token revocation
   * (they expire on their own at 15 min). Other devices that still hold a
   * refresh token will fail their next /auth/refresh call.
   */
  async changePassword(userId: string, dto: PasswordChangeDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new UnauthorizedException('Session invalide');
    }
    if (!user.passwordHash) {
      throw new BadRequestException(
        'Aucun mot de passe sur ce compte (connexion par OTP). Le changement de mot de passe ne s\'applique pas.',
      );
    }

    const matches = await verifyPassword(dto.currentPassword, user.passwordHash);
    if (!matches) {
      throw new BadRequestException('Mot de passe actuel incorrect');
    }

    // Guard against accidental no-op churn — bcrypt is expensive and
    // refresh-token revocation would log the user out of all other devices
    // for no reason.
    const sameAsOld = await verifyPassword(dto.newPassword, user.passwordHash);
    if (sameAsOld) {
      throw new BadRequestException(
        'Le nouveau mot de passe doit être différent de l\'actuel',
      );
    }

    const rounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await hashPassword(dto.newPassword, rounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordSetAt: new Date() },
      }),
      // Revoke all existing refresh tokens — other devices need to re-login.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Mot de passe modifié avec succès' };
  }

  // ---------------------------------------------------------------------------
  // Refresh / logout / profile / email verification
  // ---------------------------------------------------------------------------

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Token invalide');
      }

      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { id: payload.jti },
      });

      if (!storedToken || storedToken.revokedAt) {
        if (storedToken?.revokedAt) {
          this.logger.warn(
            `Token replay detected for user ${payload.sub}. Revoking all tokens.`,
          );
          await this.revokeAllUserTokens(payload.sub);
        }
        throw new UnauthorizedException('Token révoqué ou invalide');
      }

      const hashMatches = await bcrypt.compare(
        refreshToken,
        storedToken.tokenHash,
      );
      if (!hashMatches) {
        throw new UnauthorizedException('Token invalide');
      }

      await this.prisma.refreshToken.update({
        where: { id: payload.jti },
        data: { revokedAt: new Date() },
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub, deletedAt: null },
      });
      if (!user || user.status === 'BANNED') {
        throw new UnauthorizedException('Compte non trouvé ou banni');
      }

      return this.generateTokens(user.id, user.role, user.phone);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new UnauthorizedException('Token expiré ou invalide');
    }
  }

  async logout(userId: string, tokenId?: string) {
    if (tokenId) {
      await this.prisma.refreshToken.updateMany({
        where: { id: tokenId, userId },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.revokeAllUserTokens(userId);
    }
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      include: { sellerProfile: true },
    });
    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }
    return this.sanitizeUser(user);
  }

  async sendEmailVerification(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });
    if (!user?.email) {
      throw new BadRequestException('Aucun email associé à ce compte');
    }
    if (user.emailVerified) {
      throw new BadRequestException('Email déjà vérifié');
    }

    const token = this.jwtService.sign(
      { sub: userId, email: user.email, type: 'email_verify' },
      { secret: this.configService.get('JWT_SECRET'), expiresIn: '1h' },
    );

    const baseUrl = this.resolveWebUrlForRole(user.role);
    const verificationUrl = `${baseUrl}/verify-email?token=${token}`;
    await this.emailService.sendEmailVerification(user.email, verificationUrl);
    return { message: 'Email de vérification envoyé' };
  }

  async verifyEmail(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });
      if (payload.type !== 'email_verify') {
        throw new BadRequestException('Token invalide');
      }
      await this.prisma.user.update({
        where: { id: payload.sub },
        data: { emailVerified: true },
      });
      return { message: 'Email vérifié avec succès' };
    } catch {
      throw new BadRequestException('Lien de vérification invalide ou expiré');
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Public wrapper around generateTokens — used by BuyerOtpService and
   * BuyerClaimService to issue tokens after a successful WhatsApp OTP
   * verification, without duplicating refresh-token persistence logic.
   */
  async generateTokensForUser(
    userId: string,
    role: string,
    phone: string | null,
  ): Promise<AuthTokens> {
    return this.generateTokens(userId, role, phone);
  }

  /** Public wrapper around sanitizeUser for cross-service reuse. */
  sanitize(user: any) {
    return this.sanitizeUser(user);
  }

  private async generateTokens(
    userId: string,
    role: string,
    phone: string | null,
  ): Promise<AuthTokens> {
    const tokenId = randomUUID();
    const payload = { sub: userId, role, phone, jti: tokenId };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRY', '15m'),
    });

    const refreshToken = this.jwtService.sign(
      { sub: userId, jti: tokenId, type: 'refresh' },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRY', '7d'),
      },
    );

    const tokenHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  private async revokeAllUserTokens(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private sanitizeUser(user: any) {
    const { passwordHash, deletedAt, ...rest } = user;
    return rest;
  }

  private resolveWebUrlForRole(role: string): string {
    if (role === 'SELLER') {
      return this.configService.get('SELLER_WEB_URL', 'http://localhost:5100');
    }
    if (role === 'ADMIN' || role === 'SUPPORT' || role === 'FINANCE') {
      return this.configService.get('ADMIN_WEB_URL', 'http://localhost:5200');
    }
    return this.configService.get('BUYER_WEB_URL', 'http://localhost:5001');
  }
}
