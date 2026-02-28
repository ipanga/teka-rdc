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
import { OtpService } from '../otp/otp.service';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';

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
    private otpService: OtpService,
    private redisService: RedisService,
    private emailService: EmailService,
  ) {}

  async requestOtp(phone: string) {
    // Check if user exists to pass email for fallback
    const user = await this.prisma.user.findUnique({
      where: { phone, deletedAt: null },
    });

    const result = await this.otpService.requestOtp(phone, user?.email || undefined);
    return result;
  }

  async verifyOtp(phone: string, code: string) {
    await this.otpService.verifyOtp(phone, code);

    const user = await this.prisma.user.findUnique({
      where: { phone, deletedAt: null },
    });

    return { verified: true, exists: !!user };
  }

  async register(dto: RegisterDto) {
    // Verify OTP first
    await this.otpService.verifyOtp(dto.phone, dto.code);

    // Check if user already exists
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException('Un compte avec ce numéro existe déjà');
    }

    // Create user
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        locale: dto.locale || 'fr',
        role: 'BUYER',
        status: 'ACTIVE',
        phoneVerified: true,
      },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.role, user.phone);

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  async login(phone: string, code: string) {
    // Verify OTP
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

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.role, user.phone);

    // Update last login and phone verified
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), phoneVerified: true },
    });

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      // Verify the refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Token invalide');
      }

      // Check if token is in DB and not revoked
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { id: payload.jti },
      });

      if (!storedToken || storedToken.revokedAt) {
        // Possible token replay — revoke ALL tokens for this user
        if (storedToken?.revokedAt) {
          this.logger.warn(`Token replay detected for user ${payload.sub}. Revoking all tokens.`);
          await this.revokeAllUserTokens(payload.sub);
        }
        throw new UnauthorizedException('Token révoqué ou invalide');
      }

      // Verify hash matches
      const hashMatches = await bcrypt.compare(refreshToken, storedToken.tokenHash);
      if (!hashMatches) {
        throw new UnauthorizedException('Token invalide');
      }

      // Revoke old token
      await this.prisma.refreshToken.update({
        where: { id: payload.jti },
        data: { revokedAt: new Date() },
      });

      // Get user
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub, deletedAt: null },
      });
      if (!user || user.status === 'BANNED') {
        throw new UnauthorizedException('Compte non trouvé ou banni');
      }

      // Generate new token pair
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
      // Revoke all tokens for user
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

    const buyerWebUrl = this.configService.get('BUYER_WEB_URL', 'http://localhost:5000');
    const verificationUrl = `${buyerWebUrl}/verify-email?token=${token}`;

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

    // Store refresh token hash in DB
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
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
}
