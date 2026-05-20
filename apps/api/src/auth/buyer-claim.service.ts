import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuthService, AuthTokens } from './auth.service';
import { BuyerOtpService } from './buyer-otp.service';

export interface ClaimRequestResult {
  message: string;
}

export interface ClaimVerifyResult {
  user: any;
  tokens: AuthTokens;
}

/**
 * Claim flow for email-only legacy buyers (User.phone IS NULL) created
 * during the brief 2026-05-12 → 2026-05-15 email+password buyer window.
 *
 * Flow:
 *   1. POST /buyer/claim/request { email }
 *      → if a matching email-only buyer exists, sign a JWT with
 *        type=buyer_phone_claim and email a magic link. Always 200
 *        (enumeration-safe).
 *   2. POST /buyer/claim/verify  { token, phone, code }
 *      → verify the JWT, verify a fresh WhatsApp OTP for the phone,
 *        attach the phone to the existing User, revoke all refresh
 *        tokens, issue new ones.
 */
@Injectable()
export class BuyerClaimService {
  private readonly logger = new Logger(BuyerClaimService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
    private buyerOtpService: BuyerOtpService,
    private authService: AuthService,
  ) {}

  async requestClaim(email: string): Promise<ClaimRequestResult> {
    const neutral = {
      message: 'Si un compte correspond, un email vous a été envoyé.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
    });
    if (!user || user.role !== 'BUYER' || user.phone) {
      // Either no account, wrong role, or the buyer already has a phone
      // attached (in which case they should use the OTP login directly).
      return neutral;
    }

    const expiryHours = this.configService.get<number>(
      'BUYER_SETUP_EXPIRY_HOURS',
      24,
    );
    const token = this.jwtService.sign(
      { sub: user.id, type: 'buyer_phone_claim' },
      {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: `${expiryHours}h`,
      },
    );

    const buyerWebUrl = this.configService.get(
      'BUYER_WEB_URL',
      'http://localhost:5001',
    );
    const claimUrl = `${buyerWebUrl}/reclamer-compte/confirmer?token=${token}`;

    await this.prisma.buyerMigration.upsert({
      where: { userId: user.id },
      create: { userId: user.id, claimEmailSent: new Date() },
      update: { claimEmailSent: new Date() },
    });

    await this.emailService.sendBuyerClaimEmail(email, claimUrl);
    return neutral;
  }

  async verifyClaim(
    token: string,
    phone: string,
    code: string,
    device?: { userAgent?: string; ipAddress?: string },
  ): Promise<ClaimVerifyResult> {
    let payload: { sub?: string; type?: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });
    } catch {
      throw new BadRequestException('Lien de réclamation invalide ou expiré');
    }

    if (payload.type !== 'buyer_phone_claim' || !payload.sub) {
      throw new BadRequestException('Lien de réclamation invalide');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
    });
    if (!user || user.role !== 'BUYER') {
      throw new BadRequestException('Compte acheteur introuvable');
    }

    const otpOk = await this.buyerOtpService.verifyOtpInternal(phone, code);
    if (!otpOk) {
      throw new UnauthorizedException('Code OTP invalide ou expiré');
    }

    // Phone uniqueness is global (User.phone @unique). Reject if another
    // user already holds this phone — direct the buyer to the WhatsApp OTP
    // login for the conflicting account instead.
    const collision = await this.prisma.user.findFirst({
      where: { phone, id: { not: user.id }, deletedAt: null },
    });
    if (collision) {
      throw new ConflictException(
        'Ce numéro est déjà associé à un autre compte. Utilisez la connexion par WhatsApp pour vous y connecter.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          phone,
          phoneVerified: true,
        },
      }),
      this.prisma.buyerMigration.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          tempPhone: null,
          setupCompleted: new Date(),
        },
        update: {
          tempPhone: null,
          setupCompleted: new Date(),
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    const refreshed = await this.prisma.user.findUnique({
      where: { id: user.id },
    });
    const tokens = await this.authService.generateTokensForUser(
      refreshed!.id,
      refreshed!.role,
      refreshed!.phone,
      device,
    );
    await this.prisma.user.update({
      where: { id: refreshed!.id },
      data: { lastLoginAt: new Date() },
    });

    return { user: this.authService.sanitize(refreshed), tokens };
  }
}
