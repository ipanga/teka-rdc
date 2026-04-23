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
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from '../otp/otp.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { EmailLoginDto } from './dto/email-login.dto';
import { EmailRegisterDto } from './dto/email-register.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { EmailOtpFallbackDto } from './dto/email-otp-fallback.dto';
import { SellerMigrateCheckDto } from './dto/seller-migrate-check.dto';
import { SellerMigrateLinkEmailDto } from './dto/seller-migrate-link-email.dto';
import { SellerPasswordSetupDto } from './dto/seller-password-setup.dto';
import {
  generateResetToken,
  hashPassword,
  hashResetToken,
  verifyPassword,
} from './utils/password.util';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient = new OAuth2Client();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private otpService: OtpService,
    private emailService: EmailService,
  ) {}

  private googleAudiences(): string[] {
    const web = this.configService.get<string>('GOOGLE_WEB_CLIENT_ID', '');
    const ios = this.configService.get<string>('GOOGLE_IOS_CLIENT_ID', '');
    const android = this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID', '');
    return [web, ios, android].filter((v) => !!v);
  }

  // ---------------------------------------------------------------------------
  // Phone OTP (preserved — used by buyers and admins)
  // ---------------------------------------------------------------------------

  async requestOtp(phone: string) {
    const user = await this.prisma.user.findUnique({
      where: { phone, deletedAt: null },
    });
    return this.otpService.requestOtp(phone, user?.email || undefined);
  }

  async verifyOtp(phone: string, code: string) {
    await this.otpService.verifyOtp(phone, code);
    const user = await this.prisma.user.findUnique({
      where: { phone, deletedAt: null },
    });
    return { verified: true, exists: !!user };
  }

  async register(dto: RegisterDto) {
    await this.otpService.verifyOtp(dto.phone, dto.code);

    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) {
      throw new ConflictException('Un compte avec ce numéro existe déjà');
    }

    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        locale: dto.locale || 'fr',
        role: 'BUYER',
        status: 'ACTIVE',
        phoneVerified: true,
        authProvider: 'PHONE_OTP',
      },
    });

    const tokens = await this.generateTokens(user.id, user.role, user.phone);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { user: this.sanitizeUser(user), tokens };
  }

  async login(phone: string, code: string) {
    await this.otpService.verifyOtp(phone, code);

    const user = await this.prisma.user.findUnique({
      where: { phone, deletedAt: null },
    });
    if (!user) {
      throw new BadRequestException('Aucun compte trouvé avec ce numéro. Veuillez vous inscrire.');
    }
    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new ForbiddenException('Votre compte a été suspendu.');
    }

    // Seller migration guard — sellers must use email/password going forward.
    if (user.role === 'SELLER' && user.authProvider === 'PHONE_OTP' && !user.passwordHash) {
      throw new ConflictException({
        code: 'SELLER_MIGRATION_REQUIRED',
        message: 'Les vendeurs doivent désormais se connecter par email. Consultez votre boîte mail pour configurer votre mot de passe.',
        redirect: '/seller/migrate',
      });
    }

    const tokens = await this.generateTokens(user.id, user.role, user.phone);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), phoneVerified: true },
    });

    return { user: this.sanitizeUser(user), tokens };
  }

  // ---------------------------------------------------------------------------
  // Email + Password
  // ---------------------------------------------------------------------------

  async registerWithEmail(dto: EmailRegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Un compte avec cet email existe déjà');
    }

    const rounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await hashPassword(dto.password, rounds);

    // Users without a phone: generate a placeholder that respects uniqueness.
    // Convention: email-based registrations store a synthetic +243-prefixed
    // placeholder so the existing @unique constraint holds without a schema change.
    const placeholderPhone = `+243EMAIL${Date.now().toString().slice(-9)}`;

    const user = await this.prisma.user.create({
      data: {
        phone: placeholderPhone,
        email: dto.email,
        passwordHash,
        passwordSetAt: new Date(),
        firstName: dto.firstName,
        lastName: dto.lastName,
        locale: dto.locale || 'fr',
        role: 'BUYER',
        status: 'ACTIVE',
        authProvider: 'EMAIL_PASSWORD',
        emailVerified: false,
      },
    });

    // Fire-and-forget welcome + verification email
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
      await verifyPassword(dto.password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
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

  // ---------------------------------------------------------------------------
  // Google OAuth
  // ---------------------------------------------------------------------------

  async loginWithGoogle(dto: GoogleLoginDto) {
    const audiences = this.googleAudiences();
    if (audiences.length === 0) {
      throw new BadRequestException('Connexion Google non configurée');
    }

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: audiences,
      });
      payload = ticket.getPayload();
    } catch (error) {
      this.logger.warn(`Google idToken verification failed: ${error instanceof Error ? error.message : error}`);
      throw new UnauthorizedException('Jeton Google invalide');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Jeton Google invalide');
    }

    const emailVerifiedByGoogle = payload.email_verified === true;
    const email = payload.email.toLowerCase();

    // 1) Existing user by googleId → log in
    let user = await this.prisma.user.findUnique({
      where: { googleId: payload.sub, deletedAt: null } as any,
    });

    // 2) Existing user by email (and Google confirmed ownership) → link and log in
    if (!user && emailVerifiedByGoogle) {
      user = await this.prisma.user.findUnique({
        where: { email, deletedAt: null },
      });
      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: payload.sub,
            emailVerified: true,
          },
        });
      }
    }

    // 3) New user → create
    if (!user) {
      if (!emailVerifiedByGoogle) {
        throw new UnauthorizedException('Email Google non vérifié');
      }
      const placeholderPhone = `+243GOOGLE${Date.now().toString().slice(-8)}`;
      user = await this.prisma.user.create({
        data: {
          phone: placeholderPhone,
          email,
          googleId: payload.sub,
          firstName: payload.given_name || null,
          lastName: payload.family_name || null,
          avatar: payload.picture || null,
          locale: 'fr',
          role: 'BUYER',
          status: 'ACTIVE',
          authProvider: 'GOOGLE',
          emailVerified: true,
        },
      });
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

  // ---------------------------------------------------------------------------
  // Email OTP fallback (buyer-initiated)
  // ---------------------------------------------------------------------------

  async requestEmailOtpFallback(dto: EmailOtpFallbackDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone, deletedAt: null },
    });

    if (!user?.email) {
      throw new BadRequestException({
        code: 'NO_EMAIL_ON_FILE',
        message: 'Aucun email enregistré pour ce compte',
      });
    }

    return this.otpService.requestOtp(dto.phone, user.email, 'email');
  }

  // ---------------------------------------------------------------------------
  // Seller migration (phone-only → email+password)
  // ---------------------------------------------------------------------------

  async migrateSellerCheck(dto: SellerMigrateCheckDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });

    if (!user) {
      // Always respond 200 regardless of existence (avoid enumeration)
      return { migration: 'email_required' as const, maskedPhone: null };
    }

    if (user.role !== 'SELLER') {
      return { migration: 'email_required' as const, maskedPhone: null };
    }

    if (user.passwordHash && user.authProvider !== 'PHONE_OTP') {
      return { migration: 'already_migrated' as const };
    }

    // Seller with matching email on file — send setup link
    await this.sendSellerSetupLink(user.id, user.email!);
    return { migration: 'email_setup_sent' as const };
  }

  async migrateSellerLinkEmail(dto: SellerMigrateLinkEmailDto) {
    await this.otpService.verifyOtp(dto.phone, dto.code);

    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone, deletedAt: null },
    });
    if (!user) {
      throw new BadRequestException('Aucun compte trouvé avec ce numéro');
    }
    if (user.role !== 'SELLER') {
      throw new ForbiddenException('Ce numéro n\'appartient pas à un compte vendeur');
    }

    // If a different user already owns this email, block
    const emailOwner = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });
    if (emailOwner && emailOwner.id !== user.id) {
      throw new ConflictException('Cet email est déjà utilisé par un autre compte');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email: dto.email,
        phoneVerified: true,
      },
    });

    await this.sendSellerSetupLink(updated.id, updated.email!);
    return { migration: 'email_setup_sent' as const };
  }

  async setupSellerPassword(dto: SellerPasswordSetupDto) {
    let payload;
    try {
      payload = this.jwtService.verify(dto.token, {
        secret: this.configService.get('JWT_SECRET'),
      });
    } catch {
      throw new BadRequestException('Lien de configuration invalide ou expiré');
    }

    if (payload.type !== 'seller_password_setup' || !payload.sub) {
      throw new BadRequestException('Lien de configuration invalide');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
    });
    if (!user || user.role !== 'SELLER') {
      throw new BadRequestException('Compte vendeur introuvable');
    }

    const rounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await hashPassword(dto.password, rounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordSetAt: new Date(),
          authProvider: 'EMAIL_PASSWORD',
          emailVerified: true,
        },
      }),
      this.prisma.sellerMigration.upsert({
        where: { userId: user.id },
        create: { userId: user.id, setupCompleted: new Date() },
        update: { setupCompleted: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    const refreshed = await this.prisma.user.findUnique({ where: { id: user.id } });
    const tokens = await this.generateTokens(refreshed!.id, refreshed!.role, refreshed!.phone);
    await this.prisma.user.update({
      where: { id: refreshed!.id },
      data: { lastLoginAt: new Date() },
    });

    return { user: this.sanitizeUser(refreshed), tokens };
  }

  private async sendSellerSetupLink(userId: string, email: string) {
    const expiryHours = this.configService.get<number>('SELLER_SETUP_EXPIRY_HOURS', 24);
    const token = this.jwtService.sign(
      { sub: userId, type: 'seller_password_setup' },
      { secret: this.configService.get('JWT_SECRET'), expiresIn: `${expiryHours}h` },
    );

    const sellerWebUrl = this.configService.get('SELLER_WEB_URL', 'http://localhost:5100');
    const setupUrl = `${sellerWebUrl}/seller/setup-password?token=${token}`;

    await this.prisma.sellerMigration.upsert({
      where: { userId },
      create: { userId, setupEmailSent: new Date() },
      update: { setupEmailSent: new Date() },
    });

    await this.emailService.sendSellerSetupEmail(email, setupUrl);
  }

  // ---------------------------------------------------------------------------
  // Password reset
  // ---------------------------------------------------------------------------

  async requestPasswordReset(dto: PasswordResetRequestDto, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });

    // Always respond 200 regardless of existence (avoid enumeration)
    if (user && user.passwordHash) {
      const expiryMinutes = this.configService.get<number>('PASSWORD_RESET_EXPIRY_MINUTES', 60);
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
      this.logger.log(`Password reset requested for unknown email: ${dto.email}`);
    }

    return { message: 'Si un compte existe, un email de réinitialisation a été envoyé.' };
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
      throw new BadRequestException('Lien de réinitialisation invalide ou expiré');
    }

    const rounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await hashPassword(dto.newPassword, rounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          passwordSetAt: new Date(),
          // Users who reset may have come from PHONE_OTP or GOOGLE; consolidate to EMAIL_PASSWORD.
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

  // ---------------------------------------------------------------------------
  // Refresh / logout / profile / email verification (preserved)
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
          this.logger.warn(`Token replay detected for user ${payload.sub}. Revoking all tokens.`);
          await this.revokeAllUserTokens(payload.sub);
        }
        throw new UnauthorizedException('Token révoqué ou invalide');
      }

      const hashMatches = await bcrypt.compare(refreshToken, storedToken.tokenHash);
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
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
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

  private async generateTokens(userId: string, role: string, phone: string): Promise<AuthTokens> {
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
